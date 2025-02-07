/**
 * @import { ExtensionBlockMetadata, ExtensionMetadata } from '../main/middleware/extension-metadata'
 */

interface Ctor<T> {
    new(): T;
}

interface DucktypedBlockUtility {
    getParam(paramName: string): any;
}

interface DucktypedUnsupportedAPI {
    ScriptTreeGenerator?: {
        prototype: {
            descendInput: (this: any, block: any) => object;
        }
    }
}

interface DucktypedToolbox {
    refreshSelection(): void;
}

interface DucktypedTarget {
    isStage: boolean;
    blocks: {
        [id: string]: {
            opcode: string;
            inputs: Record<string, any>;
            mutation?: Record<string, any>;
        }
    };
}

interface DucktypedMonitor {
    id: string;
    mode: number;
    opcode: string;
    params: Record<string, any>;
}

interface DucktypedProjectJSON {
    targets: DucktypedTarget[];
    monitors: DucktypedMonitor[];
    sideloadMonitors?: DucktypedMonitor[];
    extensions: Record<string, string> | string[];
    [prop: string]: unknown;
}

interface CCXSaveData {
    projectData: DucktypedProjectJSON
}

interface DucktypedVM {
    initialized?: boolean;
    exports?: {
        i_will_not_ask_for_help_when_these_break: () => DucktypedUnsupportedAPI;
        // PenguinMod proposed change
        ScriptTreeGenerator?: DucktypedUnsupportedAPI['ScriptTreeGenerator'];
    }
    ccExtensionManager?: {
        info: Record<string, {api: number, optional?: boolean}>;
        load: Record<string, { api: number, optional?: boolean }>;
        getExtensionLoadOrder(extensions: string[]): unknown;
        getLoadedExtensions(optional: boolean): Record<string, string>;
        instance: {
            [id: string]: {
                beforeProjectSave? (data: CCXSaveData): void;
            }
        }
    }
    _events: {
        [eventName: string]: ((...args: unknown[]) => unknown) | ((...args: unknown[]) => unknown)[]
    }
    extensionManager: {
        loadExtensionURL(extensionURL: string): Promise<void>;
        refreshBlocks (optExtensionId?: string): Promise<void[]>;
    }
    on (eventName: string, callback: (...args: any[]) => any): void;
    emit (eventName: string, ...args: any[]): void;
    runtime: {
        compilerOptions?: {
            enabled: boolean;
            warpTimer: boolean;
        };
        _primitives: {
            argument_reporter_boolean (
                args: {
                    VALUE: string;
                },
                util: DucktypedBlockUtility
            ): unknown;
            [funcName: string]: (args: Record<string, any>, util: DucktypedBlockUtility) => any;
        };
        makeMessageContextForTarget (target: any): void;
        _registerExtensionPrimitives (info: ExtensionMetadata): void;
        _refreshExtensionPrimitives (info: ExtensionMetadata): void;
        _convertForScratchBlocks (info: ExtensionBlockMetadata, categoryInfo: CategoryInfo): ConvertedBlockInfo;
        _convertButtonForScratchBlocks (info: ExtensionBlockMetadata, categoryInfo: CategoryInfo): ConvertedBlockInfo;
        getEditingTarget (): any;
        getTargetForStage (): any;
        renderer: any;
    }
    toJSON(optTargetId?: string): string;
    deserializeProject(projectJSON: DucktypedProjectJSON, zip: unknown, extensionCallback?: unknown): Promise<void>;
    _loadExtensions?(extensionIDs: Set<string>, extensionURLs: Map<string, string>): Promise<void[]>;
    setLocale(locale: string, messages: Record<string, string>): Promise<void>;
    getLocale(): Locales;
}

interface DucktypedBlocksWorkspace {
    toolboxCategoryCallbacks_: {
        PROCEDURE (workspace: DucktypedBlocksWorkspace): HTMLElement[];
    }
    toolboxCategoryCallbacks?: Map<string, (workspace: DucktypedBlocksWorkspace) => void>;
    registerButtonCallback (callbackKey: string, callback: () => void): void;
    registerToolboxCategoryCallback (key: string, func: (ws: DucktypedBlocksWorkspace) => any): void;
    getToolbox(): DucktypedToolbox;
    toolboxRefreshEnabled_: boolean;
}

interface DucktypedScratchBlocks {
    Procedures: {
        addCreateButton_(workspace: DucktypedBlocksWorkspace, xmlList: HTMLElement[]): void;
    }
    Blocks: {
        [opcode: string]: {
            init (): void;
        }
    }
    dragging: {
        BlockDragStrategy (blocks: unknown): void;
    }
    getMainWorkspace (): DucktypedBlocksWorkspace;
    WorkspaceSvg: Ctor<DucktypedBlocksWorkspace>;
    __esModule?: boolean;
}
