import { describe, expect, it, vi } from 'vitest';

const requestExpandedModeMock = vi.hoisted(() => vi.fn());

vi.mock('@devvit/web/client', () => ({
  context: { username: 'test-user' },
  requestExpandedMode: requestExpandedModeMock,
}));

describe('Splash', () => {
  it('Play opens the game entrypoint', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    // splash.tsx renders on import
    await import('./splash');
    await new Promise((r) => setTimeout(r, 0));

    const play = Array.from(document.querySelectorAll('button')).find((b) => /play/i.test(b.textContent ?? ''));
    expect(play?.textContent).toContain('u/test-user');
    play!.click();

    expect(requestExpandedModeMock).toHaveBeenCalledWith(expect.anything(), 'game');
  });
});
