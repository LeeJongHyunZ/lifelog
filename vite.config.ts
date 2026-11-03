import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { defineConfig, normalizePath, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

/**
 * 하나님 음성 파일 목록을 public/voice 폴더에서 직접 읽어 "virtual:voice-files" 모듈로 넘겨줌.
 * Vercel 이 빌드할 때 GitHub 에 실제로 올라가 있는 파일만 목록에 들어가므로,
 * 오늘의 말씀은 음성 파일이 있는 말씀 중에서만 고르게 됨 (src/services/dailyWord.ts).
 * 주소 끝 ?v= 는 파일 내용으로 만든 값이라, 음성을 새로 만들면 브라우저도 새 파일을 받음.
 */
function voiceFiles(): Plugin {
  const moduleId = "virtual:voice-files";
  const resolvedId = `\0${moduleId}`;
  let voiceDir = "";

  return {
    name: "lifelog-voice-files",
    configResolved(config) {
      voiceDir = normalizePath(path.resolve(config.publicDir, "voice"));
    },
    resolveId(id) {
      return id === moduleId ? resolvedId : null;
    },
    load(id) {
      if (id !== resolvedId) return null;
      let names: string[] = [];
      try {
        names = readdirSync(voiceDir)
          .filter((name) => name.toLowerCase().endsWith(".mp3"))
          .sort();
      } catch {
        // 폴더가 없으면 빈 목록 → 모든 말씀을 기기 내장 음성으로 읽음
      }
      const files: Record<string, string> = {};
      for (const name of names) {
        const version = createHash("sha1")
          .update(readFileSync(`${voiceDir}/${name}`))
          .digest("hex")
          .slice(0, 10);
        files[name.slice(0, -".mp3".length)] = `/voice/${encodeURIComponent(name)}?v=${version}`;
      }
      return `export const VOICE_FILES = ${JSON.stringify(files, null, 2)};\n`;
    },
    configureServer(server) {
      // 개발 중에 음성을 새로 만들거나 지우면 목록을 다시 읽고 화면을 새로고침
      const onVoiceChange = (file: string) => {
        if (!normalizePath(file).startsWith(`${voiceDir}/`)) return;
        const mod = server.moduleGraph.getModuleById(resolvedId);
        if (!mod) return;
        server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("add", onVoiceChange);
      server.watcher.on("unlink", onVoiceChange);
      server.watcher.on("change", onVoiceChange);
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    voiceFiles(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.svg"],
      manifest: {
        name: "라이프로그",
        short_name: "라이프로그",
        description: "오늘의 마음을 적으면 성경 말씀으로 해석해 드려요.",
        theme_color: "#F4E1BF",
        background_color: "#FAF0DC",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        lang: "ko",
        icons: [
          {
            src: "/icon-192.svg",
            sizes: "192x192",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
          {
            src: "/icon-512.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,jpg,jpeg,webp,ico,webmanifest}"],
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/generativelanguage\.googleapis\.com\/.*/,
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
