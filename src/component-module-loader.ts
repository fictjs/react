export type ReactComponentModule = Record<string, unknown>
export type ReactComponentModuleLoader = (resolvedUrl: string) => Promise<ReactComponentModule>

const defaultComponentModuleLoader: ReactComponentModuleLoader = (resolvedUrl) =>
  import(/* @vite-ignore */ resolvedUrl) as Promise<ReactComponentModule>

let resumableComponentModuleLoader: ReactComponentModuleLoader = defaultComponentModuleLoader
let loaderComponentModuleLoader: ReactComponentModuleLoader = defaultComponentModuleLoader

export function loadResumableComponentModule(resolvedUrl: string): Promise<ReactComponentModule> {
  return resumableComponentModuleLoader(resolvedUrl)
}

export function loadLoaderComponentModule(resolvedUrl: string): Promise<ReactComponentModule> {
  return loaderComponentModuleLoader(resolvedUrl)
}

export function __setResumableComponentModuleLoaderForTests(
  loader: ReactComponentModuleLoader | null,
): void {
  resumableComponentModuleLoader = loader ?? defaultComponentModuleLoader
}

export function __resetResumableComponentModuleLoaderForTests(): void {
  resumableComponentModuleLoader = defaultComponentModuleLoader
}

export function __setLoaderComponentModuleLoaderForTests(
  loader: ReactComponentModuleLoader | null,
): void {
  loaderComponentModuleLoader = loader ?? defaultComponentModuleLoader
}

export function __resetLoaderComponentModuleLoaderForTests(): void {
  loaderComponentModuleLoader = defaultComponentModuleLoader
}
