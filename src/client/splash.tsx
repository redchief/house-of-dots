import './index.css';

import { context, requestExpandedMode } from '@devvit/web/client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

export const Splash = () => (
  <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg px-4 text-fg">
    <img src="/logo.svg" alt="" className="w-28 drop-shadow-lg" />
    <h1 className="text-3xl font-black tracking-tight">
      House of <span className="text-[#ff4500]">Dots</span>
    </h1>
    <p className="max-w-xs text-center text-sm text-muted">
      Draw lines, close boxes, stamp them with your avatar. Play randoms or invite friends.
    </p>
    <button
      className="cursor-pointer rounded-full bg-[#ff4500] px-8 py-3 font-semibold text-white transition hover:bg-[#e03d00] active:scale-95"
      onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
    >
      Play{context.username ? ` as u/${context.username}` : ''}
    </button>
  </div>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
