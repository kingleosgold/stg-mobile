/**
 * Expo Config Plugin for iOS Home Screen Widget
 *
 * This plugin:
 * 1. Adds App Group entitlement to main app
 * 2. Creates widget extension with Swift files
 * 3. Adds WidgetKit native module for React Native bridging
 */

const {
  withXcodeProject,
  withEntitlementsPlist,
  withInfoPlist,
  withDangerousMod,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const WIDGET_NAME = 'StackTrackerWidget';
const APP_GROUP_ID = 'group.com.stacktrackerpro.shared';
const BUNDLE_ID = 'com.stacktrackerpro.app';
const APPLE_TEAM_ID = '3BKELS5FG9';

/**
 * Add App Group entitlement to main app
 */
const withAppGroupEntitlement = (config) => {
  return withEntitlementsPlist(config, (config) => {
    if (!config.modResults['com.apple.security.application-groups']) {
      config.modResults['com.apple.security.application-groups'] = [];
    }
    if (!config.modResults['com.apple.security.application-groups'].includes(APP_GROUP_ID)) {
      config.modResults['com.apple.security.application-groups'].push(APP_GROUP_ID);
    }
    return config;
  });
};

/**
 * Copy native module files to iOS project
 */
const withNativeModule = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const iosPath = path.join(projectRoot, 'ios');
      const projectName = config.modRequest.projectName || 'StackTrackerPro';
      const targetDir = path.join(iosPath, projectName);

      // Create target directory if it doesn't exist
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Copy native module files
      const pluginDir = path.join(__dirname, 'widget-files');

      const nativeModuleFiles = ['WidgetKitModule.swift', 'WidgetKitModule.m'];

      for (const fileName of nativeModuleFiles) {
        const srcPath = path.join(pluginDir, fileName);
        const destPath = path.join(targetDir, fileName);

        if (fs.existsSync(srcPath)) {
          fs.copyFileSync(srcPath, destPath);
          console.log(`Copied ${fileName} to iOS project`);
        }
      }

      return config;
    },
  ]);
};

/**
 * Create widget extension directory and files
 */
const withWidgetExtension = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const iosPath = path.join(projectRoot, 'ios');
      const widgetDir = path.join(iosPath, WIDGET_NAME);

      // Create widget directory
      if (!fs.existsSync(widgetDir)) {
        fs.mkdirSync(widgetDir, { recursive: true });
      }

      // Copy widget Swift files
      const pluginDir = path.join(__dirname, 'widget-files');

      const widgetFiles = [
        'StackTrackerWidget.swift',
        'WidgetViews.swift',
        'WidgetData.swift',
      ];

      for (const fileName of widgetFiles) {
        const srcPath = path.join(pluginDir, fileName);
        const destPath = path.join(widgetDir, fileName);

        if (fs.existsSync(srcPath)) {
          fs.copyFileSync(srcPath, destPath);
          console.log(`Copied ${fileName} to widget extension`);
        }
      }

      // Create widget entitlements
      const entitlementsContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.application-groups</key>
    <array>
        <string>${APP_GROUP_ID}</string>
    </array>
</dict>
</plist>`;

      fs.writeFileSync(
        path.join(widgetDir, `${WIDGET_NAME}.entitlements`),
        entitlementsContent
      );

      // Create widget Info.plist
      const infoPlistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>$(DEVELOPMENT_LANGUAGE)</string>
    <key>CFBundleDisplayName</key>
    <string>Stack Tracker</string>
    <key>CFBundleExecutable</key>
    <string>$(EXECUTABLE_NAME)</string>
    <key>CFBundleIdentifier</key>
    <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>$(PRODUCT_NAME)</string>
    <key>CFBundlePackageType</key>
    <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
    <key>CFBundleShortVersionString</key>
    <string>$(MARKETING_VERSION)</string>
    <key>CFBundleVersion</key>
    <string>$(CURRENT_PROJECT_VERSION)</string>
    <key>NSExtension</key>
    <dict>
        <key>NSExtensionPointIdentifier</key>
        <string>com.apple.widgetkit-extension</string>
    </dict>
</dict>
</plist>`;

      fs.writeFileSync(path.join(widgetDir, 'Info.plist'), infoPlistContent);

      // Create Assets.xcassets for widget
      const assetsDir = path.join(widgetDir, 'Assets.xcassets');
      if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
      }

      // Contents.json for Assets
      fs.writeFileSync(
        path.join(assetsDir, 'Contents.json'),
        JSON.stringify({ info: { author: 'xcode', version: 1 } }, null, 2)
      );

      // AccentColor.colorset
      const accentColorDir = path.join(assetsDir, 'AccentColor.colorset');
      if (!fs.existsSync(accentColorDir)) {
        fs.mkdirSync(accentColorDir, { recursive: true });
      }
      fs.writeFileSync(
        path.join(accentColorDir, 'Contents.json'),
        JSON.stringify({
          colors: [
            {
              color: {
                'color-space': 'srgb',
                components: { red: '0.984', green: '0.749', blue: '0.141', alpha: '1.000' }
              },
              idiom: 'universal'
            }
          ],
          info: { author: 'xcode', version: 1 }
        }, null, 2)
      );

      // WidgetBackground.colorset
      const bgColorDir = path.join(assetsDir, 'WidgetBackground.colorset');
      if (!fs.existsSync(bgColorDir)) {
        fs.mkdirSync(bgColorDir, { recursive: true });
      }
      fs.writeFileSync(
        path.join(bgColorDir, 'Contents.json'),
        JSON.stringify({
          colors: [
            {
              color: {
                'color-space': 'srgb',
                components: { red: '0.102', green: '0.102', blue: '0.180', alpha: '1.000' }
              },
              idiom: 'universal'
            }
          ],
          info: { author: 'xcode', version: 1 }
        }, null, 2)
      );

      // Copy app icon to widget Assets.xcassets as AppIcon imageset
      const appIconImagesetDir = path.join(assetsDir, 'AppIcon.imageset');
      if (!fs.existsSync(appIconImagesetDir)) {
        fs.mkdirSync(appIconImagesetDir, { recursive: true });
      }

      const appIconSrc = path.join(projectRoot, 'assets', 'icon.png');
      if (fs.existsSync(appIconSrc)) {
        fs.copyFileSync(appIconSrc, path.join(appIconImagesetDir, 'icon.png'));
        fs.writeFileSync(
          path.join(appIconImagesetDir, 'Contents.json'),
          JSON.stringify({
            images: [{ filename: 'icon.png', idiom: 'universal', scale: '1x' }],
            info: { author: 'xcode', version: 1 }
          }, null, 2)
        );
        console.log('Copied app icon to widget Assets.xcassets');
      }

      console.log('Widget extension files created');
      return config;
    },
  ]);
};

/**
 * Modify Xcode project to add widget target
 */
const withXcodeProjectMod = (config) => {
  return withXcodeProject(config, async (config) => {
    const xcodeProject = config.modResults;
    const projectRoot = config.modRequest.projectRoot;

    // Add widget target to Xcode project
    const widgetBundleId = `${BUNDLE_ID}.widget`;
    const targetName = WIDGET_NAME;

    // Check if target already exists
    const existingTarget = xcodeProject.pbxTargetByName(targetName);
    if (existingTarget) {
      console.log('Widget target already exists');
      return config;
    }

    try {
      // Add the widget extension target
      const target = xcodeProject.addTarget(
        targetName,
        'app_extension',
        targetName,
        widgetBundleId
      );

      if (target) {
        console.log(`[Widget] Added widget target to Xcode project (uuid: ${target.uuid})`);

        // CRITICAL: Configure build settings using the target's buildConfigurationList directly
        // This must happen before any file operations
        try {
          const configurations = xcodeProject.pbxXCBuildConfigurationSection();
          console.log(`[Widget] Found ${Object.keys(configurations).length} build configurations total`);

          // Use the target's pbxNativeTarget to get buildConfigurationList
          const nativeTarget = target.pbxNativeTarget;
          if (nativeTarget && nativeTarget.buildConfigurationList) {
            const buildConfigListId = nativeTarget.buildConfigurationList;
            console.log(`[Widget] Target buildConfigurationList: ${buildConfigListId}`);

            const configLists = xcodeProject.hash.project.objects['XCConfigurationList'];
            const configList = configLists[buildConfigListId];

            if (configList && configList.buildConfigurations) {
              console.log(`[Widget] Found ${configList.buildConfigurations.length} configurations in list`);

              for (const configRef of configList.buildConfigurations) {
                const configId = configRef.value;
                const buildConfig = configurations[configId];

                if (buildConfig) {
                  // Initialize buildSettings if it doesn't exist
                  if (!buildConfig.buildSettings) {
                    buildConfig.buildSettings = {};
                  }
                  const buildSettings = buildConfig.buildSettings;

                  // Code signing settings - CRITICAL for EAS builds
                  buildSettings.DEVELOPMENT_TEAM = APPLE_TEAM_ID;
                  buildSettings.CODE_SIGN_STYLE = 'Automatic';

                  // Set all other required build settings
                  buildSettings.SWIFT_VERSION = '5.0';
                  buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '17.0';
                  buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
                  buildSettings.CODE_SIGN_ENTITLEMENTS = `${WIDGET_NAME}/${WIDGET_NAME}.entitlements`;
                  buildSettings.ASSETCATALOG_COMPILER_WIDGET_BACKGROUND_COLOR_NAME = 'WidgetBackground';
                  buildSettings.ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = 'AccentColor';
                  buildSettings.GENERATE_INFOPLIST_FILE = 'YES';
                  buildSettings.MARKETING_VERSION = '1.0';
                  buildSettings.CURRENT_PROJECT_VERSION = '1';
                  buildSettings.INFOPLIST_FILE = `${WIDGET_NAME}/Info.plist`;
                  buildSettings.INFOPLIST_KEY_CFBundleDisplayName = 'Stack Tracker';
                  buildSettings.INFOPLIST_KEY_NSHumanReadableCopyright = '';
                  buildSettings.LD_RUNPATH_SEARCH_PATHS = '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"';
                  buildSettings.PRODUCT_NAME = '"$(TARGET_NAME)"';
                  buildSettings.SKIP_INSTALL = 'YES';
                  buildSettings.SWIFT_EMIT_LOC_STRINGS = 'YES';
                  buildSettings.PRODUCT_BUNDLE_IDENTIFIER = widgetBundleId;

                  console.log(`[Widget] ✓ Configured ${buildConfig.name || 'unknown'} (DEVELOPMENT_TEAM=${APPLE_TEAM_ID})`);
                } else {
                  console.log(`[Widget] Warning: Could not find config for id ${configId}`);
                }
              }
            } else {
              console.log('[Widget] Warning: configList or buildConfigurations not found');
            }
          } else {
            // Fallback: search for the target in PBXNativeTarget section
            console.log('[Widget] Using fallback method to find target...');
            const nativeTargets = xcodeProject.hash.project.objects['PBXNativeTarget'];

            for (const targetKey in nativeTargets) {
              if (targetKey.endsWith('_comment')) continue; // Skip comment entries
              const nt = nativeTargets[targetKey];
              if (nt && typeof nt === 'object' && nt.name === targetName) {
                console.log(`[Widget] Found target via fallback: ${targetKey}`);
                const buildConfigListId = nt.buildConfigurationList;

                const configLists = xcodeProject.hash.project.objects['XCConfigurationList'];
                const configList = configLists[buildConfigListId];

                if (configList && configList.buildConfigurations) {
                  for (const configRef of configList.buildConfigurations) {
                    const configId = configRef.value;
                    const buildConfig = configurations[configId];

                    if (buildConfig) {
                      if (!buildConfig.buildSettings) {
                        buildConfig.buildSettings = {};
                      }
                      buildConfig.buildSettings.DEVELOPMENT_TEAM = APPLE_TEAM_ID;
                      buildConfig.buildSettings.CODE_SIGN_STYLE = 'Automatic';
                      buildConfig.buildSettings.SWIFT_VERSION = '5.0';
                      buildConfig.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '17.0';
                      buildConfig.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
                      buildConfig.buildSettings.CODE_SIGN_ENTITLEMENTS = `${WIDGET_NAME}/${WIDGET_NAME}.entitlements`;
                      buildConfig.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = widgetBundleId;
                      buildConfig.buildSettings.INFOPLIST_FILE = `${WIDGET_NAME}/Info.plist`;
                      buildConfig.buildSettings.PRODUCT_NAME = '"$(TARGET_NAME)"';
                      buildConfig.buildSettings.SKIP_INSTALL = 'YES';
                      buildConfig.buildSettings.LD_RUNPATH_SEARCH_PATHS = '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"';

                      console.log(`[Widget] ✓ Configured via fallback: ${buildConfig.name || 'unknown'} (DEVELOPMENT_TEAM=${APPLE_TEAM_ID})`);
                    }
                  }
                }
                break;
              }
            }
          }
        } catch (buildSettingsError) {
          console.log('[Widget] Error configuring build settings:', buildSettingsError.message);
          console.log('[Widget] Error stack:', buildSettingsError.stack);
        }

        // Note: File reference operations (addPbxGroup, addSourceFile, addResourceFile)
        // are corrupting the pbxproj file syntax, causing parse errors.
        // The widget target is created with build settings, but without source file references.
        // We'll need to add source files through a different mechanism.
        console.log('[Widget] Target and build settings configured. File refs skipped to avoid pbxproj corruption.');
      } else {
        console.log('[Widget] Warning: addTarget returned falsy value');
      }
    } catch (error) {
      console.log('[Widget] Target creation error:', error.message);
      console.log('[Widget] Error stack:', error.stack);
    }

    return config;
  });
};

/**
 * Main plugin export
 */
module.exports = (config) => {
  config = withAppGroupEntitlement(config);
  config = withWidgetExtension(config);
  config = withNativeModule(config);
  config = withXcodeProjectMod(config);
  return config;
};
