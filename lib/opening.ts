// 業務チェックリスト。朝・営業中・締め・週次でやることをまとめる。
// 手順書ではなく「今日やったかどうか」を見るためのもので、
// 日付が変わればまっさらに戻る。
//
// 発注だけは毎日ではないので、最後にやった日から何日経ったかで出す。

const KEY = "opening:done";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

/**
 * 朝＝開店前 ／ 営業中＝手が空いたとき ／ 夜前＝夜の営業を開ける前 ／
 * 締め＝閉店後 ／ 週次＝曜日が決まっているもの
 *
 * 週一の掃除は締めに固めていたが、深夜で手が回らない。
 * 夜を開ける前のほうが余裕があるので、そちらに寄せる。
 */
export type Phase = "朝" | "営業中" | "夜前" | "締め" | "週次";

export type Task = {
  id: string;
  phase: Phase;
  name: string;
  /** 迷いやすいところの補足 */
  detail?: string;
  /** 毎日ではない作業。何日おきか */
  everyDays?: number;
  /** 決まった曜日だけの作業。0=日。複数の曜日なら配列 */
  weekday?: number | number[];
  /**
   * 2週に1回の作業。A週（WEEK_A_START から2週ごと）の、weekday の日だけに出す。
   * 生ハムの仕入れとスープの仕込みのように、隔週のものは同じ週にまとめる
   */
  biweekly?: boolean;
  /** 夜にワッフルの残数を入力する作業 */
  waffleCount?: boolean;
  /** 前夜の残数を見て、朝焼くかどうかを出す作業 */
  waffleMorning?: boolean;
  /** 発注リストへ行く作業 */
  orderList?: boolean;
  /** 届いていない発注があるときだけ出す作業 */
  pendingOrder?: boolean;
  /** 「やった／今日はやらなくていい」を選ぶ作業。押したほうが記録される */
  choices?: [string, string];
  /** 冷凍庫から冷蔵庫へホットサンドを補充する作業（毎日） */
  hotsand?: "fridge";
  /** 夜にホットサンドの残り（冷凍庫＋冷蔵庫）を数えて入れる作業 */
  hotsandCount?: boolean;
  /** ザワークラウトを常温の発酵から冷蔵庫に移す作業。仕込んだ日から数えて出す */
  sauerkrautMove?: boolean;
  /** 牛乳・コールドブリュー・水を数える作業。朝か夜か */
  daily?: "morning" | "afternoon" | "evening";
  /** 数えた結果、足りないときだけ出す手当ての作業 */
  dailyAction?: "buy" | "prep" | "refill";
  /**
   * 生地を仕込む作業。夜の残数が少ない日と、その日に焼いた日に出る。
   * 焼いた分だけ生地が減るので、焼いた日は必ず次の生地を作る。
   */
  wafflePrep?: boolean;
  /** その日の勤怠をシフトから作る作業 */
  kintai?: boolean;
  /** 📆 仕込みの記録から「今日仕込むもの」を並べる作業。全部仕込んだら終わり */
  shikomiList?: boolean;
  /** 切れた仕込み品を記録する作業。切れた次の日に仕込みが出る */
  shikomiOut?: boolean;
  /** この仕込み（lib/shikomi の id）が今日あるときだけ出す作業 */
  shikomiFor?: string[];
};

/** A週の始まり（月曜）。ここから2週ごとがA週 */
export const WEEK_A_START = "2026-10-26";

/** その日を含む週の月曜 */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** A週かどうか。WEEK_A_START より前の週も2週ごとに数える */
export function isWeekA(date: string): boolean {
  const weeks = Math.round(
    (new Date(`${mondayOf(date)}T00:00:00Z`).getTime() -
      new Date(`${WEEK_A_START}T00:00:00Z`).getTime()) /
      (7 * 86_400_000),
  );
  return ((weeks % 2) + 2) % 2 === 0;
}

/** 曜日の決まった作業が、その日にあるか */
export function weekdayDue(t: Task, date: string): boolean {
  if (t.weekday === undefined) return false;
  const wd = new Date(`${date}T00:00:00Z`).getUTCDay();
  const wds = Array.isArray(t.weekday) ? t.weekday : [t.weekday];
  if (!wds.includes(wd)) return false;
  return t.biweekly ? isWeekA(date) : true;
}

export const TASKS: Task[] = [
  {
    id: "espresso",
    phase: "朝",
    name: "エスプレッソマシンを立ち上げる",
    detail: "いちばん時間がかかるので最初に電源を入れる",
  },
  { id: "clean-floor", phase: "朝", name: "店舗掃除（掃除機・テーブル拭き）" },
  { id: "clean-toilet", phase: "朝", name: "トイレ掃除" },
  {
    id: "trash-bag",
    phase: "朝",
    name: "ゴミ袋がセットされているか確認",
    detail: "袋をつけるのは締めの作業。抜けていたらここで気づく",
  },
  {
    id: "waffle",
    phase: "朝",
    name: "ワッフルをセットする",
    detail:
      "前日に焼いたものが冷蔵庫にあればそれをセット。無ければ前日に仕込んだ生地を焼く。廃棄期限は2日。" +
      "どちらをしたか押しておくと、今夜の生地の仕込みが要るかを自動で判断する",
    /** 前夜に数えた残数から、焼くかどうかを出し分ける */
    waffleMorning: true,
  },
  {
    id: "dishes",
    phase: "朝",
    name: "前日洗った食器類を拭いて片付ける",
    detail: "ワッフルの準備をしながら進める",
  },
  {
    id: "towels-out",
    phase: "朝",
    name: "タオルを色ごとに出す",
    detail:
      "緑＝エスプレッソマシン用 ／ ピンク＝台拭き ／ 白＝皿拭き ／ " +
      "青＝台所拭き ／ 白＝手拭き ／ エスプレッソの器具用" +
      "（取り外す部品を、粉を捨てたあとに拭くもの）。用途が混ざらないよう色で分ける",
  },
  {
    id: "cafe-supplies",
    phase: "朝",
    name: "カフェ備品が補充されているか確認",
    detail: "マドラー・シロップ・砂糖・ウェットティッシュなど。切れていたらストックルームから足す",
  },
  {
    // 2026-10-14〜 煮沸はやめて、締めでハイターにつける流れに変えた。
    // 夜つけたものを朝すすいで干し、夜の営業前に乾いたものを畳む
    id: "duster-rinse",
    phase: "朝",
    name: "ハイターにつけたダスター・コーヒータオル・手洗いタオルをすすいで干す",
    detail: "前の晩の締めでハイターにつけたもの。よくすすいでから干す",
  },
  {
    id: "dishes-put-away",
    phase: "営業中",
    name: "16時半に干してある食器を拭いて全部戻す",
    detail: "夜の営業前に洗い場を空にしておく",
  },
  {
    id: "dishes-shift-end",
    phase: "営業中",
    name: "シフト上がりに、干してある食器を拭いて元の場所に戻す",
    detail:
      "自分のシフトが終わるときに毎回やる。次に入る人が濡れた食器を触らずに済むようにする。" +
      "拭くのは白いタオル（皿拭き用）",
  },
  {
    id: "candle-set",
    phase: "営業中",
    name: "18時45分にキャンドルを置く",
    detail: "夜の営業前の準備。充電は金曜の締めでやる",
  },
  {
    id: "stockroom-check",
    phase: "営業中",
    name: "ストックルームの補充",
    detail:
      "倉庫からストックルームへ補充する。倉庫に無くて補充できなかったものが発注するもの。「ストック確認」のページで記録する。" +
      "水・日の仕込みの前の月曜・金曜にやる。ページの上に次の仕込み日に仕込むものと材料が出るので、材料が足りるかも見る。" +
      "仕込み品で仕込み時のもの（ザワークラウトなど）は「仕込む」を押すと、次の営業日の「今日の仕込み」に出る",
    // 2026-10-26 月曜だけ → 月曜・土曜 → 同日 坂本さん決定で月曜・金曜（水曜・日曜の仕込みの前）
    weekday: [1, 5],
  },
  {
    id: "order-reconcile",
    phase: "締め",
    name: "会計済みなのに残っている注文がないか確認",
    detail:
      "注文画面にテーブルが埋まったまま残っていたら、Square側では会計が済んでいる可能性が高い。「残った注文を片付ける」を押すと自動で照合して閉じる",
  },
  {
    id: "order",
    phase: "営業中",
    name: "足りないものを発注する",
    detail:
      "ストック確認で倉庫に無かったものが「📋 発注リスト」に並ぶ。数を決めて買い、「発注済みにする」を押す。毎週月曜にまとめて発注する",
    weekday: 1,
    orderList: true,
  },

  {
    // 2026-10-26 坂本さん「毎晩ホットサンドの仕込みの数だけ記録してほしい」。
    // 残りの数が毎晩わかれば、1日に何個出たか・仕込む量が合っているかが見える
    id: "hotsand-count",
    phase: "締め",
    name: "ホットサンドの残りを数える",
    detail: "冷凍庫と冷蔵庫を合わせた、クラシックとガーデンの数を入れる。冷蔵庫への補充の前に数える",
    hotsandCount: true,
  },
  {
    id: "hotsand-fridge",
    // 2026-10-26 坂本さん決定：朝ではなく締めで、翌日の分を補充する
    phase: "締め",
    name: "ホットサンドを冷蔵庫に補充する",
    detail:
      "翌日の分を補充する。翌日が平日なら各3つ、土日・連休なら各5つ。足りなければ冷凍庫から移す。" +
      "連休かどうかは自分で判断する",
    hotsand: "fridge",
  },
  // 2026-10-14〜 ホットサンドは水曜と日曜にまとめて仕込む。
  // それまでは冷凍庫の残りを見て「翌日仕込む」を決めていたが、曜日固定に変えた。
  {
    id: "hotsand-sunday-check",
    phase: "朝",
    name: "ホットサンドの残数を見て、今日仕込むか決める",
    detail:
      "日曜の仕込みは、月曜・水曜の2営業日分。冷凍庫にクラシック5・ガーデン5以上残っていれば今日は仕込まない" +
      "（金曜にイベントで多めに仕込んだ週など）。「今回は仕込まない」を押すと、今日の仕込みの作業が消える",
    weekday: 0,
    choices: ["日曜も仕込む", "今回は仕込まない"],
  },
  {
    // 2026-10-26 坂本さん決定：タネは水曜と土曜に仕込む（水曜はその日の午後に挟む分、土曜は日曜に挟む分）
    id: "hotsand-tane",
    phase: "営業中",
    name: "ホットサンドのタネを仕込む",
    detail:
      "水曜はその日の午後に挟む分、土曜は翌日（日曜）に挟む分。量は「仕込み」に出ている数" +
      "（水曜 クラシック18・ガーデン15、日曜 各9）",
    weekday: [3, 6],
  },
  // 2026-10-26〜 仕込みは「今日の仕込み」にまとめた。消費期限・切れた日・決まった曜日から出る。
  // ホットサンドの午後の仕込みとスープのベースも、ここから出す（lib/shikomi の TASKS）
  {
    id: "shikomi-today",
    phase: "営業中",
    name: "今日の仕込み",
    detail:
      "期限が来たもの・前の日に切れたもの・決まった曜日のものが並ぶ。決まった量だけ仕込んで「仕込んだ」を押す。" +
      "押した日から次の期限を数える",
    shikomiList: true,
  },
  {
    // 2026-10-26 坂本さん決定：ザワークラウトは仕込んだ3日後（4〜9月）・7日後（10〜3月）に冷蔵庫へ移す。
    // チェックを付けるまで毎日出す（付けたらその回の分は終わり）
    id: "sauerkraut-fridge",
    phase: "営業中",
    name: "ザワークラウトを冷蔵庫に移す",
    detail: "常温で発酵させていたザワークラウトを冷蔵庫へ。仕込んだ日から、4〜9月は3日後・10〜3月は7日後",
    sauerkrautMove: true,
  },
  {
    id: "prosciutto-buy",
    phase: "営業中",
    name: "アミカで生ハムを仕入れる",
    detail: "2週に1回、A週の月曜に買う（アミカの店頭）。在庫確認の生ハムの数も見てから行く",
    weekday: 1,
    biweekly: true,
  },
  {
    // 2026-10-26 坂本さん決定：月曜と土曜に平和堂へ電話して発注する。牛乳・パンと一緒に卵・あみえびも。
    // 在庫にあるものは頼まない。（食パンの手配・あみえびの材料確認は、この1つにまとめた）
    id: "heiwado-order",
    phase: "営業中",
    name: "平和堂に電話して発注する（牛乳・パン・卵・あみえび）",
    detail:
      "在庫を見て、足りないものだけ頼む（あるものは頼まない）。食パンは水曜・日曜の仕込みの分も入れる。" +
      "あみえびうま煮は水曜のあみえびクリームチーズ用（冷凍のタッパの残りを見る）",
    weekday: [1, 6],
  },
  {
    id: "espresso-close",
    phase: "締め",
    name: "23時にエスプレッソマシンを閉める",
    detail:
      "ラストオーダーの前に落とす。以降はドリップで対応する。" +
      "手順は ①洗浄する ②拭く ③水を抜く ④電源を切る ⑤水が溜まっているところ（ドリップトレイ）の水を捨てる",
  },
  {
    id: "last-order",
    phase: "締め",
    name: "23時半にラストオーダーを聞く",
    detail: "お客さん全席に回って聞く",
  },
  {
    id: "waffle-prep",
    phase: "締め",
    name: "明日の分のワッフル生地を仕込む",
    detail:
      "今日ワッフルを焼いた日と、22時に数えて2個以下のフレーバーがあった日に出る。" +
      "焼いた分だけ生地が減るので、焼いたらその日のうちに次を仕込む",
    wafflePrep: true,
  },
  { id: "dishes-wash", phase: "締め", name: "食器を洗う" },
  {
    id: "trash-burnable",
    phase: "締め",
    name: "燃えるゴミをまとめて新しい袋をつける",
    detail: "トイレとホールのゴミも一緒に集めてから、新しい袋をセットする",
  },
  {
    id: "duster",
    phase: "夜前",
    name: "干してあるダスター・コーヒータオル・手洗いタオルを畳んで片付ける",
    detail: "朝にすすいで干したもの。乾いていたら畳んで所定の場所へ",
  },
  {
    id: "drain-clean",
    phase: "夜前",
    name: "排水溝を掃除する",
    weekday: 1,
  },
  {
    id: "ice-drain",
    phase: "締め",
    name: "製氷機の氷を全て抜く",
    detail:
      "貯氷庫を空にして、翌朝は新しい氷から使う。古い氷が溜まったままにならないようにする",
    weekday: 1,
  },
  {
    id: "duster-bleach",
    phase: "締め",
    name: "その日使ったダスター・コーヒータオル・手洗いタオルをハイターにつける",
    detail:
      "3種類ともまとめてつける。手洗いタオルの入れ忘れが起きやすい。" +
      "翌朝すすいで干す",
  },
  {
    id: "kintai-fix",
    phase: "締め",
    name: "今日の勤怠をつける",
    detail:
      "つけ忘れが多いので、締めのときにまとめてつける。" +
      "シフトどおりなら1回押すだけ。違う日はその場で直す",
    kintai: true,
  },
  {
    id: "cash-close",
    phase: "締め",
    name: "レジを締める",
    detail: "手順は「レジ締め」のページにあります",
  },
  {
    // 2026-09-13と9/14に続けて抜き忘れ、3日分がドロワーに溜まった。
    // 締めたつもりで金が残っていると、次の日の締めが全部ズレる。
    id: "cash-take",
    phase: "締め",
    name: "売上金をドロワーから抜く",
    detail:
      "レジを締めたら、その日の現金売上を抜いて金庫へ。" +
      "ドロワーに残すのは釣銭の30,000円ちょうど。" +
      "数えて30,000円でなければ、抜く額が間違っています",
  },
  {
    id: "stove-clean",
    phase: "夜前",
    name: "コンロまわりとトースターを掃除する",
    detail: "コンロを拭く → コンロ付近を掃除する → トースターを清掃する",
    weekday: 3,
  },
  {
    id: "sink-coat",
    phase: "夜前",
    name: "シンク・台下冷蔵庫・製氷機の上を磨く",
    detail: "洗浄 → 研磨 → コーティング剤を散布、の順にやる",
    weekday: 4,
  },
  {
    id: "dish-rack-wash",
    phase: "夜前",
    name: "食器干しを洗う",
    detail: "水受けまで外して洗う。ぬめりと水垢が溜まりやすい",
    weekday: 4,
  },
  {
    id: "server-duster",
    phase: "夜前",
    name: "ウォーターサーバーの下のダスター（ピンク）を替える",
    detail: "受け皿の下に敷いてあるもの。濡れたままだと匂いが出る",
    weekday: 1,
  },
  {
    id: "candle-charge",
    phase: "締め",
    name: "キャンドルライトを充電する",
    detail: "週末に切れないよう、金曜の締めで充電しておく",
    weekday: 5,
  },
  // ここから下は帰る直前にやること。上から順にやれば消し忘れない
  {
    id: "water-server",
    phase: "締め",
    name: "ウォーターサーバーを洗う",
  },
  {
    id: "chairs-up",
    phase: "締め",
    name: "椅子を上げる",
    detail: "翌朝の掃除機がけのため",
  },
  {
    id: "toilet-light",
    phase: "締め",
    name: "トイレの電気を消す",
  },
  {
    id: "lights-off",
    phase: "締め",
    name: "1階と2階の電気を消す",
  },
  {
    id: "aircon-off",
    phase: "締め",
    name: "エアコンを消す",
  },
  {
    id: "gas-off",
    phase: "締め",
    name: "ガスが止まっているか確認する",
    detail: "コンロのつまみと元栓の両方を見る。火が消えていても元栓が開いていることがある",
  },
  {
    id: "lock-check",
    phase: "締め",
    name: "施錠を確認する",
    detail: "表の入口・裏口・窓を一通り見る",
  },
  {
    id: "keybox-scramble",
    phase: "締め",
    name: "外の鍵ケースの番号をバラバラに戻す",
    detail:
      "閉めたあと、ダイヤルが暗証番号のまま残っていないか必ず見る。" +
      "揃ったままだと誰でも開けられてしまう",
  },
  {
    id: "grinder-wash",
    phase: "締め",
    name: "グラインダーの備品を洗う",
    detail: "毎日洗う",
  },
];

/** 日付ごとの、終わった作業のid */
type DoneMap = Record<string, string[]>;

/**
 * 業務チェックの「今日」。営業日は朝6時で切り替える。
 *
 * 24時半まで営業しているので、締め作業の途中で日付が変わってしまう。
 * カレンダーどおりだと0時を回った瞬間に翌日のまっさらなリストになり、
 * それまでチェックした分が見えなくなる。朝6時までは前日として扱う。
 */
export function todayJST(): string {
  return new Date(Date.now() + (9 - 6) * 3600 * 1000).toISOString().slice(0, 10);
}

async function load(): Promise<DoneMap> {
  const store = await kv();
  if (!store) return {};
  return (await store.get<DoneMap>(KEY)) ?? {};
}

async function save(m: DoneMap) {
  const store = await kv();
  if (!store) return;
  // 古い記録は消す。60日分だけ残す
  const keep = Object.keys(m).sort().slice(-60);
  const next: DoneMap = {};
  for (const d of keep) next[d] = m[d];
  await store.set(KEY, next);
}

export async function getDone(date: string): Promise<string[]> {
  return (await load())[date] ?? [];
}

export async function toggle(date: string, taskId: string, done: boolean) {
  const m = await load();
  const cur = new Set(m[date] ?? []);
  if (done) cur.add(taskId);
  else cur.delete(taskId);
  m[date] = [...cur];
  await save(m);
  return [...cur];
}

/** その作業を最後にやった日。一度もなければ null */
export async function lastDoneDate(taskId: string): Promise<string | null> {
  const m = await load();
  const days = Object.keys(m)
    .filter((d) => (m[d] ?? []).includes(taskId))
    .sort();
  return days.length ? days[days.length - 1] : null;
}

const CHOICE_KEY = "opening:choice";

/** 日付 → 作業id → 選んだ答え */
type ChoiceMap = Record<string, Record<string, string>>;

export async function getChoices(date: string): Promise<Record<string, string>> {
  const store = await kv();
  if (!store) return {};
  return ((await store.get<ChoiceMap>(CHOICE_KEY)) ?? {})[date] ?? {};
}

export async function saveChoice(date: string, taskId: string, answer: string) {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const all = (await store.get<ChoiceMap>(CHOICE_KEY)) ?? {};
  all[date] = { ...(all[date] ?? {}), [taskId]: answer };
  const keep = Object.keys(all).sort().slice(-120);
  const next: ChoiceMap = {};
  for (const d of keep) next[d] = all[d];
  await store.set(CHOICE_KEY, next);
  return all[date];
}

const WAFFLE_KEY = "opening:waffle";

/** フレーバー名。ワッフルは3種類 */
export const WAFFLE_FLAVORS = ["プレーン", "チョコチップ", "抹茶"] as const;

/**
 * 日付 → フレーバーごとの残数。
 * bakedAt はいま冷蔵庫にあるものを焼いた日。
 * baked は「今朝、焼いたのか（true）冷蔵庫から出したのか（false）」。
 * 焼いた日が分からない日でも押したことが残るよう、別に持つ。
 */
type WaffleDay = { counts: Record<string, number>; bakedAt?: string; baked?: boolean };
type WaffleMap = Record<string, WaffleDay>;

/* ── ザワークラウトの発酵 ───────────────────── */

/** 常温で発酵させる日数。4〜9月は3日、10〜3月は7日（仕込んだ日の月で決める） */
export function fermentDays(madeDate: string): number {
  const m = Number(madeDate.slice(5, 7));
  return m >= 4 && m <= 9 ? 3 : 7;
}

/* ── ホットサンドの残り（毎晩） ───────────────── */

const HOTSAND_KEY = "hotsand:counts";
export type HotsandCount = { classic: number; garden: number; at: string };

export async function getHotsandCounts(): Promise<Record<string, HotsandCount>> {
  const store = await kv();
  if (!store) return {};
  return (await store.get<Record<string, HotsandCount>>(HOTSAND_KEY)) ?? {};
}

export async function saveHotsandCount(date: string, classic: number, garden: number): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const all = await getHotsandCounts();
  all[date] = { classic, garden, at: new Date().toISOString() };
  await store.set(HOTSAND_KEY, all);
}

export async function getWaffleCounts(): Promise<WaffleMap> {
  const store = await kv();
  if (!store) return {};
  return (await store.get<WaffleMap>(WAFFLE_KEY)) ?? {};
}

/**
 * その日のワッフルの記録を書く。
 * 朝は bakedAt だけ、夜は counts だけを書くので、渡さなかったほうは今の値を残す。
 */
export async function saveWaffleCount(
  date: string,
  counts?: Record<string, number>,
  bakedAt?: string,
): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const all = await getWaffleCounts();
  const cur = all[date] ?? { counts: {} };
  const keepBaked = bakedAt || cur.bakedAt;
  all[date] = {
    counts: counts ?? cur.counts,
    ...(keepBaked ? { bakedAt: keepBaked } : {}),
    ...(cur.baked !== undefined ? { baked: cur.baked } : {}),
  };
  const keep = Object.keys(all).sort().slice(-60);
  const next: WaffleMap = {};
  for (const d of keep) next[d] = all[d];
  await store.set(WAFFLE_KEY, next);
}

/**
 * 朝、ワッフルを焼いたのか冷蔵庫から出したのかを記録する。
 *
 * これが分かると、夜に生地を仕込むかどうかが自動で決まる。
 * 焼いた日なら冷蔵庫のものは今日焼きたてなので明日も出せる。
 * 冷蔵庫から出しただけなら、そのワッフルは前に焼いたものなので、
 * 明日には期限切れになり、今夜のうちに生地を仕込む必要がある。
 */
export async function setWaffleBaked(date: string, baked: boolean): Promise<string | undefined> {
  const all = await getWaffleCounts();
  // 焼いたなら今日が焼いた日。出しただけなら前日までの焼いた日を引き継ぐ。
  // 引き継ぐ日が無いこともあるので、押したこと自体は baked に残す
  const carried = all[yesterdayOf(date)]?.bakedAt;
  const bakedAt = baked ? date : carried;
  const cur = all[date] ?? { counts: {} };
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  all[date] = { counts: cur.counts, baked, ...(bakedAt ? { bakedAt } : {}) };
  const keep = Object.keys(all).sort().slice(-60);
  const next: WaffleMap = {};
  for (const d of keep) next[d] = all[d];
  await store.set(WAFFLE_KEY, next);
  return bakedAt;
}

export function yesterdayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * 前夜の残数から、朝どうするかを決める。
 *
 * ワッフルの廃棄期限は2日なので、朝焼いたものは明後日には出せない。
 * そのため状態は次のように連鎖する。
 *
 *   夜に2個以下 → 生地を仕込む → 翌朝その生地を焼く
 *   夜に3個以上 → 仕込まない  → 翌朝は冷蔵庫のものをセット（＝持ち越し）
 *                              → その持ち越しは翌々日には期限切れになるので、
 *                                 その日の夜は必ず仕込み、翌朝は確定で焼く
 *
 * bakedAt は、いま冷蔵庫にあるワッフルを焼いた日。
 * これが2日前なら、今日はもう出せないので確定で焼く。
 */
export function morningPlan(
  counts: Record<string, number> | undefined,
  bakedAt?: string,
  today?: string,
) {
  // 期限切れの判定を最優先。焼いた日から2日経っていたら出せない
  if (bakedAt && today) {
    const age = daysBetween(bakedAt, today);
    if (age >= 2) {
      return {
        known: true,
        bake: [...WAFFLE_FLAVORS],
        mustBake: true,
        text: `冷蔵庫のワッフルは${bakedAt.slice(5).replace("-", "/")}に焼いたもので期限切れです。今朝は全フレーバーを焼いてください`,
      };
    }
  }
  if (!counts || Object.keys(counts).length === 0) {
    return {
      known: false,
      bake: [] as string[],
      mustBake: false,
      text: "前夜の残数が記録されていません。冷蔵庫を見て判断してください",
    };
  }
  const bake = WAFFLE_FLAVORS.filter((f) => (counts[f] ?? 0) <= 2);
  const detail = WAFFLE_FLAVORS.map((f) => `${f}${counts[f] ?? 0}個`).join("・");
  if (!bake.length) {
    const extra = bakedAt
      ? `（今あるものは${bakedAt.slice(5).replace("-", "/")}焼き。明日は期限切れになるので、今夜は必ず仕込んでください）`
      : "";
    return {
      known: true,
      bake: [],
      mustBake: false,
      text: `昨夜は${detail}。すべて3個以上あるので、今朝は焼かずに冷蔵庫のものをセットする${extra}`,
    };
  }
  return {
    known: true,
    bake: [...bake],
    mustBake: false,
    text: `昨夜は${detail}。${bake.join("・")}が2個以下なので、仕込んである生地を今朝焼く`,
  };
}

/**
 * 夜に生地を仕込むべきか。
 * 2個以下があれば仕込む。加えて、持ち越したワッフルが翌日に期限切れになるなら、
 * 残数にかかわらず必ず仕込む（翌朝焼くものが無くなるため）。
 */
export function nightPlan(
  counts: Record<string, number> | undefined,
  bakedAt?: string,
  today?: string,
  bakedToday?: boolean,
) {
  const low = counts
    ? WAFFLE_FLAVORS.filter((f) => (counts[f] ?? 0) <= 2)
    : [];
  // 今朝は焼かずに冷蔵庫から出した＝今あるものは前に焼いたもの。
  // 明日には出せなくなるので、残数にかかわらず仕込む
  if (bakedToday === false) {
    return {
      prep: true,
      text: "今朝は冷蔵庫のものを出したので、今あるワッフルは明日には期限切れです。今夜は生地を仕込んでください",
    };
  }
  // 今あるものが1日前に焼いたもの＝明日は2日目で出せない
  const expiring = !!(bakedAt && today && daysBetween(bakedAt, today) >= 1);
  if (expiring) {
    return {
      prep: true,
      text: `今あるワッフルは${bakedAt!.slice(5).replace("-", "/")}焼きで明日は期限切れです。残数にかかわらず今夜は生地を仕込んでください`,
    };
  }
  if (low.length) {
    return { prep: true, text: `${low.join("・")}が2個以下なので、明日用の生地を仕込んでください` };
  }
  return { prep: false, text: "すべて3個以上あるので、今夜は仕込まなくて大丈夫です" };
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000,
  );
}
