/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import importFresh from 'import-fresh';
import {
  LoadContext,
  PluginConfig,
  Preset,
  PresetConfig,
} from '@docusaurus/types';

export function loadPresets(
  context: LoadContext,
): {
  plugins: PluginConfig[];
  themes: PluginConfig[];
} {
  const presets: PresetConfig[] = (context.siteConfig || {}).presets || [];
  const unflatPlugins: PluginConfig[][] = [];
  const unflatThemes: PluginConfig[][] = [];

  presets.forEach((presetItem) => {
    let presetModuleImport;
    let presetOptions = {};
    if (typeof presetItem === 'string') {
      presetModuleImport = presetItem;
    } else if (Array.isArray(presetItem)) {
      presetModuleImport = presetItem[0];
      presetOptions = presetItem[1] || {};
    } else {
      throw new Error('Invalid presets format detected in config.');
    }

    const presetModule: any = importFresh(presetModuleImport);
    const preset: Preset = (presetModule.default || presetModule)(
      context,
      presetOptions,
    );

    preset.plugins && unflatPlugins.push(preset.plugins);
    preset.themes && unflatThemes.push(preset.themes);
  });

  return {
    plugins: ([] as PluginConfig[]).concat(...unflatPlugins).filter(Boolean),
    themes: ([] as PluginConfig[]).concat(...unflatThemes).filter(Boolean),
  };
}
