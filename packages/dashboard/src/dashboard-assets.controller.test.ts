import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { DashboardAssetsController } from './dashboard-assets.controller.js';

// Requires the UI build (`pnpm build:ui`, wired as `pretest`) to have already
// populated dist/public with the real bundled client/CSS assets.
describe('DashboardAssetsController', () => {
  it('serves a known bundled asset with a matching content type', () => {
    const controller = new DashboardAssetsController();

    const file = controller.asset('main.js');

    expect(file.options.type).toContain('text/javascript');
  });

  it('serves the bundled stylesheet with a matching content type', () => {
    const controller = new DashboardAssetsController();

    const file = controller.asset('main.css');

    expect(file.options.type).toContain('text/css');
  });

  it('throws NotFoundException for an unknown asset', () => {
    const controller = new DashboardAssetsController();

    expect(() => controller.asset('does-not-exist.js')).toThrow(NotFoundException);
  });

  it('cannot escape the assets directory via path traversal in the filename param', () => {
    const controller = new DashboardAssetsController();

    // `basename()` strips any directory components, so this resolves to
    // "assets/etc-passwd" (not found) rather than escaping upward.
    expect(() => controller.asset('../../../../etc/passwd')).toThrow(NotFoundException);
  });
});
