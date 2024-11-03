import formatMessage, { Message } from 'format-message';
import { Cast } from '../util/cast';
import { eureka } from '../ctx';
import { ArgumentType, BlockType, TargetType, ReporterScope, StandardScratchExtensionClass, ExtensionMetadata, ExtensionBlockMetadata, BlockArgs, ExtensionMenu, MenuItems } from './extension-metadata';
import log from '../util/console';
import { getScratchBlocksInstance } from '../trap/blocks';
import { maybeFormatMessage } from '../util/maybe-format-message';

const loadedExtensions = new Map<string, StandardScratchExtensionClass>();

interface ExtensionContainer extends HTMLScriptElement {
    Scratch?: ExtendedScratchObject;
}

export const predefinedCallbackKeys = [
    'MAKE_A_LIST',
    'MAKE_A_PROCEDURE',
    'MAKE_A_VARIABLE',
    'CREATE_LIST',
    'CREATE_PROCEDURE',
    'CREATE_VARIABLE'
];

export async function forwardedLoadExtensionURL (url: string) {
    const res = await fetch(url, {
        cache: 'no-cache'
    });
    const code = await res.text();
    return new Promise<void>((resolve, reject) => {
        const elem: ExtensionContainer = document.createElement('script');
        const scratchObj = makeScratchObject(eureka);
        scratchObj.extensions.register = function (extensionObj) {
            const info = prepareExtensionInfo(extensionObj, extensionObj.getInfo());
            eureka.vm.runtime._registerExtensionPrimitives(info);

            loadedExtensions.set(url, extensionObj);

            // Dispose temporary extension container
            URL.revokeObjectURL(src);
            document.head.removeChild(elem);
            resolve();
        };
        const src = URL.createObjectURL(
            new Blob(
                [
                    `
/**
 * Generated by Eureka
 */
let Scratch = document.getElementById('eureka-extension')?.Scratch;
${code}
//# sourceURL=${url}
`
                ],
                { type: 'text/javascript' }
            )
        );
        elem.defer = true;
        elem.Scratch = scratchObj;
        elem.type = 'module'; // Experimental ESM support
        elem.src = src;
        elem.id = `eureka-extension`;
        document.head.appendChild(elem);
        elem.addEventListener('error', (err) => {
            URL.revokeObjectURL(src);
            document.head.removeChild(elem);
            reject(err.error);
        });
    });
}

function prepareExtensionInfo (extensionObject: StandardScratchExtensionClass, info: ExtensionMetadata) {
    info = Object.assign({}, info);
    if (!/^[a-z0-9]+$/i.test(info.id)) {
        throw new Error('Invalid extension id');
    }

    info.name ??= info.id;
    info.blocks ??= [];
    info.targetTypes ??= [];
    info.blocks = info.blocks.reduce(
        (results: Array<string | ExtensionBlockMetadata>, blockInfo) => {
            try {
                let result;
                switch (blockInfo) {
                    case '---': // Separator
                        result = '---';
                        break;
                    default: // An ExtensionBlockMetadata object
                        result = prepareBlockInfo(
                            extensionObject,
                            blockInfo as ExtensionBlockMetadata
                        );
                        break;
                }
                results.push(result);
            } catch (e: unknown) {
                // TODO: more meaningful error reporting
                log.error(
                    `Error processing block: ${(e as Error).message}, Block:\n${JSON.stringify(
                        blockInfo
                    )}`
                );
            }
            return results;
        },
        []
    );
    info.menus ??= {};
    info.menus = prepareMenuInfo(
        extensionObject,
        info.menus
    );
    return info as ExtensionMetadata;
}

function prepareMenuInfo (
    extensionObject: StandardScratchExtensionClass,
    menus: Record<string, ExtensionMenu>
) {
    const menuNames = Object.getOwnPropertyNames(menus);
    for (let i = 0; i < menuNames.length; i++) {
        const menuName = menuNames[i];
        let menuInfo = menus[menuName];

        /*
         * If the menu description is in short form (items only) then normalize it to general form: an object with
         * its items listed in an `items` property.
         */
        if (!menuInfo.items) {
            menuInfo = {
                // @ts-expect-error lazy to write type hint
                items: menuInfo
            };
            menus[menuName] = menuInfo;
        }
        /*
         * If `items` is a string, it should be the name of a function in the extension object. Calling the
         * function should return an array of items to populate the menu when it is opened.
         */
        if (typeof menuInfo.items === 'string') {
            const menuItemFunctionName = menuInfo.items;
            menuInfo.items = getExtensionMenuItems.bind(
                this,
                extensionObject,
                menuItemFunctionName
            );
        }
    }
    return menus;
}

function getExtensionMenuItems (
    extensionObject: StandardScratchExtensionClass,
    menuItemFunctionName: string,
): [string, string][] {
    /*
     * Fetch the items appropriate for the target currently being edited. This assumes that menus only
     * collect items when opened by the user while editing a particular target.
     */

    const editingTarget =
        eureka.vm.runtime.getEditingTarget() || eureka.vm.runtime.getTargetForStage();
    const editingTargetID = editingTarget ? editingTarget.id : null;
    eureka.vm.runtime.makeMessageContextForTarget(editingTarget);

    // TODO: Fix this to use dispatch.call when extensions are running in workers.
    const menuFunc = extensionObject[menuItemFunctionName] as (
        editingTargetID: string | null
    ) => MenuItems;
    const menuItems = menuFunc.call(extensionObject, editingTargetID).map((item) => {
        item = maybeFormatMessage(item)!;
        switch (typeof item) {
            case 'object':
                return [maybeFormatMessage(item.text), item.value];
            case 'string':
                return [item, item];
            default:
                return item;
        }
    });

    if (!menuItems || menuItems.length < 1) {
        throw new Error(`Extension menu returned no items: ${menuItemFunctionName}`);
    }
    return menuItems;
}

function sanitizeID (text: string) {
    return text.toString().replace(/[<"&]/, '_');
}

function prepareBlockInfo (extensionObject: StandardScratchExtensionClass, blockInfo: ExtensionBlockMetadata) {
    blockInfo = Object.assign(
        {},
        {
            blockType: BlockType.COMMAND,
            terminal: false,
            blockAllThreads: false,
            arguments: {}
        },
        blockInfo
    );
    blockInfo.opcode = blockInfo.opcode && sanitizeID(blockInfo.opcode);
    blockInfo.text = blockInfo.text || blockInfo.opcode;

    switch (blockInfo.blockType) {
        case BlockType.EVENT:
            if (blockInfo.func) {
                log.warn(
                    `Ignoring function "${blockInfo.func}" for event block ${blockInfo.opcode}`
                );
            }
            break;
        case BlockType.BUTTON: {
            if (!blockInfo.func) {
                break;
            }
            if (blockInfo.opcode) {
                log.warn(
                    `Ignoring opcode "${blockInfo.opcode}" for button with text: ${blockInfo.text}`
                );
            }

            if (predefinedCallbackKeys.includes(blockInfo.func)) {
                break;
            }

            const funcName = blockInfo.func;
            const buttonCallback = (() => {
                if (!extensionObject[funcName]) {
                    // The function might show up later as a dynamic property of the service object
                    log.warn(`Could not find extension block function called ${funcName}`);
                }
                return () =>
                    // @ts-expect-error treat as callable
                    extensionObject[funcName]();
            })();
            // @ts-expect-error internal hack
            blockInfo.callFunc = buttonCallback;
            blockInfo.func = funcName;
            break;
        }
        case BlockType.LABEL:
            if (blockInfo.opcode) {
                log.warn(
                    `Ignoring opcode "${blockInfo.opcode}" for label with text: ${blockInfo.text}`
                );
            }
            break;
        case BlockType.XML:
            if (blockInfo.opcode) {
                log.warn(`Ignoring opcode "${blockInfo.opcode}" for xml: ${blockInfo.xml}`);
            }
            break;
        default: {
            if (!blockInfo.opcode) {
                throw new Error('Missing opcode for block');
            }

            const funcName = blockInfo.func
                ? sanitizeID(blockInfo.func)
                : blockInfo.opcode;

            const getBlockInfo = blockInfo.isDynamic
                ? (args: BlockArgs) => args && args.mutation && args.mutation.blockInfo
                : () => blockInfo;
            const callBlockFunc = (() => {
                if (!extensionObject[funcName]) {
                    // The function might show up later as a dynamic property of the service object
                    log.warn(`Could not find extension block function called ${funcName}`);
                }
                return (args: BlockArgs, util: DucktypedBlockUtility, realBlockInfo: unknown) =>
                    // @ts-expect-error treat it as callable
                    extensionObject[funcName](args, util, realBlockInfo);
            })();

            // @ts-expect-error internal hack
            blockInfo.func = (args: BlockArgs, util: DucktypedBlockUtility) => {
                const realBlockInfo = getBlockInfo(args);
                // TODO: filter args using the keys of realBlockInfo.arguments? maybe only if sandboxed?
                return callBlockFunc(args, util, realBlockInfo);
            };
            break;
        }
    }

    return blockInfo;
}


/**
 * Scratch 3's primitive Scratch object.
 */
interface BaseScratchObject {
    ArgumentType: typeof ArgumentType;
    BlockType: typeof BlockType;
    TargetType: typeof TargetType;
    ReporterScope: typeof ReporterScope;
    extensions: {
        register: (extensionObj: StandardScratchExtensionClass) => void;
    };
}

interface ExtendedScratchObject extends BaseScratchObject {
    Cast: Cast;
    extensions: BaseScratchObject['extensions'] & {
        unsandboxed: boolean;
        chibi: true;
        eureka: true;
    }
    vm: DucktypedVM;
    translate: ReturnType<typeof createTranslate>;
    renderer?: any;
    fetch: typeof fetch;
    canFetch(url: string): boolean;
    gui: {
        getBlockly: () => Promise<DucktypedScratchBlocks>;
        getBlocklyEagerly: () => typeof Blockly | null;
    }
}

function parseURL (url: string) {
    try {
        return new URL(url, location.href);
    } catch (e) {
        return null;
    }
}

function makeScratchObject (ctx: EurekaContext): ExtendedScratchObject {
    return {
        ArgumentType,
        BlockType,
        TargetType,
        ReporterScope,
        Cast,
        extensions: {
            register: () => {
                throw new Error('not implemented');
            },
            unsandboxed: true,
            chibi: true,
            eureka: true
        },
        vm: ctx.vm,
        translate: createTranslate(ctx.vm),
        fetch: (url: URL | RequestInfo, options?: RequestInit | undefined) => fetch(url, options),
        canFetch: (url: string) => {
            const parsed = parseURL(url);
            return !!parsed;
        },
        gui: {
            getBlockly: () => getScratchBlocksInstance(ctx.vm),
            getBlocklyEagerly: () => getScratchBlocksInstance.cache
        }
    };
}

/**
 * I10n support for Eureka extensions.
 * @param vm Virtual machine instance. Optional.
 * @returns Something like Scratch.translate.
 */
function createTranslate (vm: DucktypedVM) {
    const namespace = formatMessage.namespace();

    const translate = (message: Message, args?: object) => {
        if (message && typeof message === 'object') {
            // Already in the expected format
        } else if (typeof message === 'string') {
            message = {
                default: message
            };
        } else {
            throw new Error('unsupported data type in translate()');
        }
        return namespace(message, args);
    };

    const generateId = (defaultMessage: string) => `_${defaultMessage}`;

    let currentLocale = vm.getLocale();

    const getLocale = () => currentLocale;

    let storedTranslations = {};
    translate.setup = (newTranslations: Message | object | null) => {
        if (newTranslations) {
            storedTranslations = newTranslations;
        }
        namespace.setup({
            locale: getLocale(),
            missingTranslation: 'ignore',
            generateId,
            translations: storedTranslations
        });
    };

    translate.setup({});

    if (vm) {
        vm.on('LOCALE_CHANGED', (locale: string) => {
            currentLocale = locale;
            translate.setup(null);
        });
    }

    // TurboWarp/scratch-vm@24b6036
    Object.defineProperty(translate, 'language', {
        configurable: true,
        enumerable: true,
        get: () => getLocale()
    });

    return translate;
}

export async function refreshForwardedBlocks () {
    loadedExtensions.forEach((obj) => {
        const info = prepareExtensionInfo(obj, obj.getInfo());
        eureka.vm.runtime._refreshExtensionPrimitives(info);
    });
}

eureka.load = (url: string) => {
    eureka.declaredIds.push(url);
    forwardedLoadExtensionURL(url);
};
