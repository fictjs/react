export interface ReactIslandsLoaderOptions {
  document?: Document
}

/**
 * Placeholder loader.
 * Full resumable loader is implemented in a later feature commit.
 */
export function installReactIslands(_options: ReactIslandsLoaderOptions = {}): () => void {
  return () => {}
}
