import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Game Daily · 给创作者的游戏早报",
  description: "为独立开发者准备的每日游戏行业、工具与设计简报",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
