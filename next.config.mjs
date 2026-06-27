/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // 領収書画像のアップロードに備えてボディ上限を引き上げ
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
