/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {generate} from '@docusaurus/utils';
import path from 'path';
import {
  BUILD_DIR_NAME,
  CONFIG_FILE_NAME,
  GENERATED_FILES_DIR_NAME,
  THEME_PATH,
} from '../constants';
import {loadClientModules} from './client-modules';
import {loadConfig} from './config';
import {loadPlugins} from './plugins';
import {loadPresets} from './presets';
import {loadRoutes} from './routes';
import {loadThemeAlias} from './themes';
import {
  DocusaurusConfig,
  LoadContext,
  PluginConfig,
  Props,
} from '@docusaurus/types';
import {loadHtmlTags} from './html-tags';

export function loadContext(
  siteDir: string,
  customOutDir?: string,
): LoadContext {
  const generatedFilesDir: string = path.resolve(
    siteDir,
    GENERATED_FILES_DIR_NAME,
  );
  const siteConfig: DocusaurusConfig = loadConfig(siteDir);
  const outDir = customOutDir
    ? path.resolve(customOutDir)
    : path.resolve(siteDir, BUILD_DIR_NAME);
  const {baseUrl} = siteConfig;

  return {
    siteDir,
    generatedFilesDir,
    siteConfig,
    outDir,
    baseUrl,
  };
}

export function loadPluginConfigs(context: LoadContext): PluginConfig[] {
  const {plugins: presetPlugins, themes: presetThemes} = loadPresets(context);
  const {siteConfig} = context;
  return [
    ...presetPlugins,
    ...presetThemes,
    // Site config should be the highest priority.
    ...(siteConfig.plugins || []),
    ...(siteConfig.themes || []),
  ];
}

export async function load(
  siteDir: string,
  customOutDir?: string,
): Promise<Props> {
  // Context.
  const context: LoadContext = loadContext(siteDir, customOutDir);
  const {generatedFilesDir, siteConfig, outDir, baseUrl} = context;
  const genSiteConfig = generate(
    generatedFilesDir,
    CONFIG_FILE_NAME,
    `export default ${JSON.stringify(siteConfig, null, 2)};`,
  );

  // Plugins.
  const pluginConfigs: PluginConfig[] = loadPluginConfigs(context);
  const {plugins, pluginsRouteConfigs} = await loadPlugins({
    pluginConfigs,
    context,
  });

  // Themes.
  const fallbackTheme = path.resolve(__dirname, '../client/theme-fallback');
  const pluginThemes = ([] as string[]).concat(
    ...plugins
      .map<any>((plugin) => plugin.getThemePath && plugin.getThemePath())
      .filter(Boolean),
  );
  const userTheme = path.resolve(siteDir, THEME_PATH);
  const alias = loadThemeAlias([fallbackTheme, ...pluginThemes], [userTheme]);

  // Make a fake plugin to:
  // - Resolve aliased theme components
  // - Inject scripts/stylesheets
  const {stylesheets = [], scripts = []} = siteConfig;
  plugins.push({
    name: 'docusaurus-bootstrap-plugin',
    configureWebpack: () => ({
      resolve: {
        alias,
      },
    }),
    injectHtmlTags: () => {
      const stylesheetsTags = stylesheets.map((source) =>
        typeof source === 'string'
          ? `<link rel="stylesheet" href="${source}">`
          : {
              tagName: 'link',
              attributes: {
                rel: 'stylesheet',
                ...source,
              },
            },
      );
      const scriptsTags = scripts.map((source) =>
        typeof source === 'string'
          ? `<script type="text/javascript" src="${source}"></script>`
          : {
              tagName: 'script',
              attributes: {
                type: 'text/javascript',
                ...source,
              },
            },
      );
      return {
        headTags: [...stylesheetsTags, ...scriptsTags],
      };
    },
  });

  // Load client modules.
  const clientModules = loadClientModules(plugins);
  const genClientModules = generate(
    generatedFilesDir,
    'client-modules.js',
    `export default [\n${clientModules
      // import() is async so we use require() because client modules can have
      // CSS and the order matters for loading CSS.
      // We need to JSON.stringify so that if its on windows, backslash are escaped.
      .map((module) => `  require(${JSON.stringify(module)}),`)
      .join('\n')}\n];\n`,
  );

  // Load extra head & body html tags.
  const {headTags, preBodyTags, postBodyTags} = loadHtmlTags(plugins);

  // Routing.
  const {
    registry,
    routesChunkNames,
    routesConfig,
    routesPaths,
  } = await loadRoutes(pluginsRouteConfigs, baseUrl);

  const genRegistry = generate(
    generatedFilesDir,
    'registry.js',
    `export default {
${Object.keys(registry)
  .sort()
  .map(
    (key) =>
      // We need to JSON.stringify so that if its on windows, backslash are escaped.
      `  '${key}': [${registry[key].loader}, ${JSON.stringify(
        registry[key].modulePath,
      )}, require.resolveWeak(${JSON.stringify(registry[key].modulePath)})],`,
  )
  .join('\n')}};\n`,
  );

  const genRoutesChunkNames = generate(
    generatedFilesDir,
    'routesChunkNames.json',
    JSON.stringify(routesChunkNames, null, 2),
  );

  const genRoutes = generate(generatedFilesDir, 'routes.js', routesConfig);

  await Promise.all([
    genClientModules,
    genSiteConfig,
    genRegistry,
    genRoutesChunkNames,
    genRoutes,
  ]);

  const props: Props = {
    siteConfig,
    siteDir,
    outDir,
    baseUrl,
    generatedFilesDir,
    routesPaths,
    plugins,
    headTags,
    preBodyTags,
    postBodyTags,
  };

  return props;
}
