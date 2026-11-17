/** The popup's heading: the extension's name and version as the built manifest has them. */
export const title = (manifest: { name: string; version: string }) =>
  `${manifest.name} v${manifest.version}`;
