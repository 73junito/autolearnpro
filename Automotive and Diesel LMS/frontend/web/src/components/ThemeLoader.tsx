"use client"

import { useEffect } from "react";

export default function ThemeLoader() {
  useEffect(() => {
    let mounted = true;
    async function fetchTheme() {
      const cached = typeof window !== 'undefined' ? window.localStorage.getItem('mcp_http_port') : null;
      const base = cached ? [Number(cached)] : [];
      const ports = [...new Set([...base, 5005, 5006, 5007, 5008, 5009, 5010])];
      for (const p of ports) {
        if (!mounted) return;
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3000);
          const res = await fetch(`http://localhost:${p}/theme`, { cache: 'no-store', signal: controller.signal });
          clearTimeout(timeout);
          if (!res.ok) continue;
          const data = await res.json();
          if (!mounted) return;
          if (data?.variables) {
            Object.entries(data.variables).forEach(([k, v]) => {
              try { document.documentElement.style.setProperty(k, String(v)); } catch (e) { }
            });
          }
          // cache working port
          try { window.localStorage.setItem('mcp_http_port', String(p)); } catch (e) { }
          // also check for an SD/OG image and set CSS var for hero background if found
          try {
            // prefer png then svg
            const candidates = ['/images/og-homepage.png', '/images/og-homepage.jpg', '/images/og-homepage.svg'];
            for (const c of candidates) {
              try {
                const head = await fetch(c, { method: 'HEAD', cache: 'no-store' });
                if (head.ok) {
                  document.documentElement.style.setProperty('--hero-image-url', `url('${c}')`);
                  break;
                }
              } catch (e) { continue; }
            }
          } catch (e) {
            // ignore
          }
          return;
        } catch (err) {
          // try next port
          continue;
        }
      }
    }
    fetchTheme();
    return () => { mounted = false };
  }, []);

  return null;
}
