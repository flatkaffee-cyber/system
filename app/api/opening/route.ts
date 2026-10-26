import { NextRequest, NextResponse } from "next/server";
import {
  TASKS,
  WAFFLE_FLAVORS,
  daysBetween,
  getDone,
  getWaffleCounts,
  lastDoneDate,
  morningPlan,
  nightPlan,
  getChoices,
  mondayOf,
  isWeekA,
  weekdayDue,
  saveChoice,
  saveWaffleCount,
  setWaffleBaked,
  todayJST,
  toggle,
  yesterdayOf,
} from "@/lib/opening";
import { openOrders } from "@/lib/purchase";
import {
  getTasks as getShikomiTasks,
  addRecord as addShikomiRecord,
  batchLabel,
  buildStates as buildShikomiStates,
  getRecords as getShikomiRecords,
  isScheduledDay,
  removeRecord as removeShikomiRecord,
} from "@/lib/shikomi";
import { getShifts } from "@/lib/shift";
import { isOffSeason, offSeasonNames } from "@/lib/menuAdmin";
import { getKintai } from "@/lib/kintai";
import type { Slot } from "@/lib/dailycheck";
import {
  dayState as dailyState,
  saveValues as saveDaily,
  clearValues as clearDaily,
  type Values as DailyValues,
} from "@/lib/dailycheck";

export const runtime = "nodejs";

// GET /api/opening?date=YYYY-MM-DD → 今日のチェック状況
export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get("date") || todayJST();
    const done = await getDone(date);

    // ワッフルは前夜に数えた残数を朝の判断に使う。
    // 廃棄期限が2日あるので、いつ焼いたものかも見て出し分ける
    const waffle = await getWaffleCounts();
    const yst = waffle[yesterdayOf(date)];
    const tdy = waffle[date];

    // 発注チェックは、届いていない発注があるときだけ出す
    const pending = await openOrders();
    const choices = await getChoices(date);
    // 前日の昼に「翌日仕込む」を押していたら、今日の朝に仕込みを出す
    // 販売期間の外のメニュー（例 10〜3月のコールドブリュー）の作業は出さない
    const off = await offSeasonNames(Number(date.slice(5, 7)));
    const daily = await dailyState(date, off);
    const [shifts, kin] = await Promise.all([getShifts(), getKintai()]);
    // 夜に足りなかったものは、翌朝の手当てとして持ち越す。
    // ただし今朝もう数えているなら、そちらが最新なので持ち越さない。
    const yEvening = (await dailyState(yesterdayOf(date), off)).evening;
    const carried = daily.morning.counted ? [] : yEvening.needs;
    const dailyNeeds = [
      ...carried,
      ...daily.morning.needs,
      ...daily.afternoon.needs,
      ...daily.evening.needs,
    ];
    const morning = morningPlan(yst?.counts, yst?.bakedAt, date);
    const night = nightPlan(
      tdy?.counts ?? yst?.counts,
      tdy?.bakedAt ?? yst?.bakedAt,
      date,
      tdy?.baked,
    );

    // 今日の仕込み。期限・切れた次の日・決まった曜日から出る（lib/shikomi）。
    // 別の作業で出しているもの（コールドブリュー）と、確認の作業は除く
    const [shikomiRecords, allShikomiTasks] = await Promise.all([getShikomiRecords(), getShikomiTasks()]);
    const shikomiTasks = allShikomiTasks.filter((t) => !isOffSeason(off, t.menuName));
    const wdToday = new Date(`${date}T00:00:00Z`).getUTCDay();
    // 日曜の朝に「今回は仕込まない」を選んだら、日曜の予定としてのホットサンドは出さない（切れた・期限は残す）
    const skipSundayHotsand = wdToday === 0 && choices["hotsand-sunday-check"] === "今回は仕込まない";
    const shikomiStates = buildShikomiStates(shikomiRecords, date, shikomiTasks)
      .filter((s) => s.kind === "仕込み")
      .map((s) => ({
        ...s,
        dueReasons:
          skipSundayHotsand && s.id.startsWith("hotsand")
            ? s.dueReasons.filter((r) => r.reason !== "予定日")
            : s.dueReasons,
      }));
    const shikomiToday = shikomiStates.filter(
      (s) => !s.openingTask && (s.dueReasons.length > 0 || s.doneToday),
    );

    const tasks = await Promise.all(
      TASKS.map(async (t) => {
        if (t.shikomiList) {
          // 並んだものを全部仕込んだら終わり。チェックは仕込みの記録から決まる
          return {
            ...t,
            due: shikomiToday.length > 0,
            done: shikomiToday.length > 0 && shikomiToday.every((s) => s.doneToday),
          };
        }
        if (t.shikomiFor) {
          return {
            ...t,
            done: done.includes(t.id),
            due: shikomiToday.some((s) => t.shikomiFor!.includes(s.id)),
          };
        }
        if (t.pendingOrder) {
          return { ...t, done: done.includes(t.id), due: pending.length > 0 };
        }
        if (t.hotsand) {
          // 冷蔵庫への補充は毎日
          return { ...t, done: done.includes(t.id), due: true };
        }
        if (t.kintai) {
          // シフトに載っている全員の勤怠がある日は、もう出さない
          const st = shifts.filter((x) => x.date === date);
          const kd = kin.filter((x) => x.date === date);
          const filled =
            st.length > 0 &&
            st.every((x) => kd.some((y) => (y.member || y.name) === x.staff));
          return { ...t, done: done.includes(t.id) || filled, due: st.length > 0 };
        }
        if (t.wafflePrep) {
          // 焼いた日は、焼いた分だけ生地が減っているので必ず仕込む。
          // 焼いていない日でも、夜に数えて足りなければ出す
          return {
            ...t,
            done: done.includes(t.id),
            due: tdy?.baked === true || night.prep,
          };
        }
        if (t.dailyAction) {
          return {
            ...t,
            done: done.includes(t.id),
            due: dailyNeeds.some((n) => n.action === t.dailyAction),
          };
        }
        if (t.choices) {
          return {
            ...t,
            done: done.includes(t.id),
            answer: choices[t.id] ?? null,
            ...(t.weekday !== undefined ? { due: weekdayDue(t, date) } : {}),
          };
        }
        if (t.weekday !== undefined) {
          // 曜日が決まっている作業。その曜日以外は「今日はなし」。隔週のものはA週だけ
          const due = weekdayDue(t, date);
          return { ...t, done: done.includes(t.id), due, ...(t.biweekly ? { weekA: isWeekA(date) } : {}) };
        }
        if (!t.everyDays) return { ...t, done: done.includes(t.id) };
        // 何日おきの作業は、前回からの経過で今日やるべきか判断する
        const last = await lastDoneDate(t.id);
        const since = last ? daysBetween(last, date) : null;
        return {
          ...t,
          done: done.includes(t.id),
          lastDate: last,
          daysSince: since,
          due: since === null || since >= t.everyDays,
        };
      }),
    );

    // コールドブリューを売っていない時期は、仕込みの作業を外し、数える作業の名前からも外す
    if (isOffSeason(off, "コールドブリュー")) {
      const strip = (x?: string) => x?.replace(/コールドブリュー・/g, "").replace(/・コールドブリュー/g, "");
      for (let i = tasks.length - 1; i >= 0; i--) {
        const t = tasks[i];
        if (t.dailyAction === "prep") tasks.splice(i, 1);
        else if (t.daily) tasks[i] = { ...t, name: strip(t.name)!, detail: strip(t.detail) };
      }
    }

    // きょう必要な作業のうち、終わった数
    const need = tasks.filter((t) => !("due" in t) || t.due);

    // 今週（月〜日）の予定。曜日の決まった作業と、仕込み（期限・切れた次の日・決まった曜日）。
    // 過ぎた日は実際に仕込んだもの、今日は今日の仕込み、先の日は予定を出す
    const monday = mondayOf(date);
    type WeekItem = { name: string; phase: string; kind: "fixed" | "interval" | "done"; note?: string };
    const week = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(`${monday}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + i);
      const day = d.toISOString().slice(0, 10);
      const items: WeekItem[] = TASKS
        .filter((t) => weekdayDue(t, day) && t.id !== "hotsand-sunday-check")
        .map((t) => ({ name: t.name, phase: t.phase, kind: "fixed" as const, ...(t.biweekly ? { note: "隔週・A週" } : {}) }));
      for (const st of shikomiStates) {
        if (st.openingTask) continue;
        if (day < date) {
          if (shikomiRecords.some((r) => r.taskId === st.id && r.date === day && r.type !== "out"))
            items.push({ name: st.name, phase: "仕込み", kind: "done", note: "仕込んだ" });
          continue;
        }
        if (day === date) {
          if (st.doneToday) items.push({ name: st.name, phase: "仕込み", kind: "done", note: "今日仕込んだ" });
          else if (st.dueReasons.length)
            items.push({
              name: `${st.name} ${st.todayBatch}`,
              phase: "仕込み",
              kind: "interval",
              note: st.dueReasons.map((r) => r.text).join("・"),
            });
          continue;
        }
        // 先の日：決まった曜日か、次に仕込む日（期限・切れた次の日）
        const t = shikomiTasks.find((x) => x.id === st.id)!;
        const onNext = st.nextDate === day && st.nextDate > date;
        if (isScheduledDay(t, day) || onNext) {
          items.push({
            name: `${st.name} ${batchLabel(t, day)}`,
            phase: "仕込み",
            kind: "interval",
            note: isScheduledDay(t, day) ? undefined : st.expiresOn === day ? "期限の日" : "予定の日",
          });
        }
      }
      return { date: day, weekday: d.getUTCDay(), items };
    });
    return NextResponse.json({
      date,
      tasks,
      waffle: {
        flavors: WAFFLE_FLAVORS,
        yesterday: yst?.counts ?? null,
        yesterdayBakedAt: yst?.bakedAt ?? null,
        today: tdy?.counts ?? null,
        // 今朝どちらを押したか
        bakedToday: tdy?.baked === true,
        bakedAt: tdy?.bakedAt ?? null,
        answered: tdy?.baked !== undefined,
        morning,
        night,
      },
      pendingOrders: pending,
      // 今日の仕込みと、切れたを押すための一覧
      shikomi: {
        today: shikomiToday.map((x) => ({
          id: x.id, name: x.name, batch: x.todayBatch, reasons: x.dueReasons,
          batchNum: x.todayBatchNum, unit: x.unit ?? "", qty: x.todayQty,
          doneToday: x.doneToday, materials: x.materials, note: x.note,
        })),
        items: shikomiStates
          .filter((x) => !x.openingTask)
          .map((x) => ({ id: x.id, name: x.name, lastDate: x.lastDate, expiresOn: x.expiresOn, outToday: x.outToday })),
      },
      daily: { ...daily, carried },
      // 締めで勤怠をつけるときに使う。シフトと、すでに入っている勤怠
      kintai: {
        shifts: shifts.filter((x) => x.date === date).map((x) => ({ staff: x.staff, start: x.start, end: x.end })),
        filled: kin.filter((x) => x.date === date).map((x) => x.member || x.name),
      },
      week: { monday, weekA: isWeekA(date), days: week },
      total: need.length,
      doneCount: need.filter((t) => t.done).length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗" },
      { status: 500 },
    );
  }
}

// POST /api/opening
//   { taskId, done, date? }              … チェックの付け外し
//   { choice: { taskId, answer }, date? } … 2択の作業でどちらを選んだか
//   { dailyCount: {...}, date? }         … 牛乳・コールドブリュー・水を数えた結果
//   { waffleBaked: true|false, date? }   … 朝、焼いたか冷蔵庫から出したか
//   { waffleCounts, bakedAt?, date? }    … 夜のワッフル残数の記録
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as {
      taskId?: string;
      done?: boolean;
      date?: string;
      waffleCounts?: Record<string, number>;
      bakedAt?: string;
      waffleBaked?: boolean;
      choice?: { taskId?: string; answer?: string };
      dailyCount?: { slot?: Slot; values?: DailyValues };
    };

    if (b.choice?.taskId && b.choice.answer) {
      const date = b.date || todayJST();
      const task = TASKS.find((t) => t.id === b.choice!.taskId);
      if (!task?.choices?.includes(b.choice.answer)) {
        return NextResponse.json({ error: "その選択肢はありません" }, { status: 400 });
      }
      const answers = await saveChoice(date, b.choice.taskId, b.choice.answer);
      // どちらを選んでも「見た」ことに変わりはないので終わりにする
      await toggle(date, b.choice.taskId, true);
      return NextResponse.json({ ok: true, date, answers });
    }

    if (b.dailyCount) {
      const date = b.date || todayJST();
      const slot: Slot = b.dailyCount.slot === "evening" ? "evening" : "morning";
      await saveDaily(date, slot, b.dailyCount.values ?? {});
      await toggle(date, slot === "morning" ? "daily-morning" : "daily-evening", true);
      return NextResponse.json({ ok: true, date, daily: await dailyState(date, await offSeasonNames(Number(date.slice(5, 7)))) });
    }




    if (b.waffleBaked !== undefined) {
      const date = b.date || todayJST();
      const bakedAt = await setWaffleBaked(date, b.waffleBaked);
      const all = await getWaffleCounts();
      const plan = nightPlan(
        all[date]?.counts ?? all[yesterdayOf(date)]?.counts,
        bakedAt,
        date,
        b.waffleBaked,
      );
      // 焼いたなら「ワッフルをセットする」も終わったものとして扱う
      await toggle(date, "waffle", true);
      return NextResponse.json({ ok: true, date, bakedAt: bakedAt ?? null, night: plan });
    }
    if (b.waffleCounts) {
      const date = b.date || todayJST();
      await saveWaffleCount(date, b.waffleCounts, b.bakedAt);
      const plan = nightPlan(b.waffleCounts, b.bakedAt, date);
      return NextResponse.json({ ok: true, date, night: plan });
    }
    if (!b.taskId) return NextResponse.json({ error: "taskIdが必要です" }, { status: 400 });
    if (!TASKS.some((t) => t.id === b.taskId)) {
      return NextResponse.json({ error: `知らない作業: ${b.taskId}` }, { status: 400 });
    }
    const date = b.date || todayJST();
    const done = await toggle(date, b.taskId, b.done !== false);
    // コールドブリューのように業務チェックの作業で仕込むものは、仕込みの記録にも残す（分析に使う）
    for (const st of (await getShikomiTasks()).filter((x) => x.openingTask === b.taskId)) {
      if (b.done !== false) await addShikomiRecord({ taskId: st.id, date, by: "業務チェック" });
      else await removeShikomiRecord(st.id, date);
    }
    return NextResponse.json({ ok: true, date, done });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗" },
      { status: 500 },
    );
  }
}

// DELETE /api/opening { dailyDate, dailySlot } → 数え間違えた記録を消す
export async function DELETE(req: NextRequest) {
  try {
    const b = (await req.json()) as { dailyDate?: string; dailySlot?: Slot };
    if (!b.dailyDate || !b.dailySlot) {
      return NextResponse.json({ error: "dailyDateとdailySlotが必要です" }, { status: 400 });
    }
    await clearDaily(b.dailyDate, b.dailySlot);
    await toggle(
      b.dailyDate,
      b.dailySlot === "morning" ? "daily-morning" : "daily-evening",
      false,
    );
    return NextResponse.json({ ok: true, daily: await dailyState(b.dailyDate, await offSeasonNames(Number(b.dailyDate.slice(5, 7)))) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "削除に失敗" },
      { status: 500 },
    );
  }
}
