import './meta.js?userscript-metadata';
import log from './util/console';
import settingsAgent from './util/settings';
import {version} from '../../package.json';
import {getVMInstance} from './trap/vm';
import {getScratchBlocksInstance} from './trap/blocks';
import formatMessage from 'format-message';
import {eureka} from './ctx';
import {applyPatchesForVM, applyPatchesForBlocks} from './patches/applier';
import {setLocale} from './util/l10n';
import {getRedux, getReduxStoreFromDOM} from './trap/redux';
import './dashboard/app';

log.info(
    formatMessage({
        id: 'eureka.loading',
        default: 'Eureka (Version {version})'
    }, {version})
);

const settings = settingsAgent.getSettings();

// Mutex for traps
let vmTrapped = false;

// First trap - Hijack Function.prototype.bind
const trapViaBind = async () => {
    if (settings.trap.vm) {
        try {
            const vm = eureka.vm = await getVMInstance().then(trappedVM => {
                vmTrapped = true;
                if (settings.trap.blocks) {
                    getScratchBlocksInstance(trappedVM).then(blocks => {
                        eureka.blocks = blocks;
                        log.info(
                            formatMessage({
                                id: 'eureka.blocksReady',
                                default: 'ScratchBlocks is ready.'
                            })
                        );
                        if (settings.behavior.polyfillGlobalInstances &&
                            typeof globalThis.ScratchBlocks === 'undefined') {
                            globalThis.ScratchBlocks = eureka.blocks;
                        }

                        if (!settings.behavior.headless) {
                            applyPatchesForBlocks(eureka.blocks);
                        }
                    })
                        .catch(e => {
                            log.error(
                                formatMessage({
                                    id: 'eureka.failedToGetBlocks',
                                    default: 'Failed to get ScratchBlocks.'
                                })
                                , '\n', e);
                        });
                }
                return trappedVM;
            });
            if (settings.behavior.polyfillGlobalInstances && typeof globalThis.vm === 'undefined') {
                globalThis.vm = vm;
            }
            setLocale(vm.getLocale());

            if (settings.behavior.headless) {
                log.warn(
                    formatMessage({
                        id: 'eureka.headlessTips',
                        default: 'Headless mode on, stop apply patches.'
                    })
                );
            } else {
                applyPatchesForVM(vm, eureka);
            }
        } catch (e) {
            if (vmTrapped) return;

            log.error(
                formatMessage({
                    id: 'eureka.failedToGetVM',
                    default: 'Failed to get VM.'
                })
                , '\n', e);
        }
    }
};

// Trap for Redux
const trapRedux = async () => {
    if (settings.trap.redux) {
        try {
            log.info(
                formatMessage({
                    id: 'eureka.gettingRedux',
                    default: 'Getting Redux...'
                })
            );
            eureka.redux = await getRedux();
            log.info(
                formatMessage({
                    id: 'eureka.reduxReady',
                    default: 'Redux is ready.'
                })
            );
            if (settings.behavior.polyfillGlobalInstances && typeof globalThis.ReduxStore === 'undefined') {
                globalThis.ReduxStore = {
                    dispatch: eureka.redux.dispatch,
                    getState: () => eureka.redux.state,
                    subscribe: (cb: (state: any) => void) => {
                        if (typeof cb !== 'function') {
                            throw new Error('The listener is not a function');
                        }
                        const wrappedCb = (ev: CustomEvent) => {
                            cb(ev.detail.next);
                        };
                        eureka.redux.target.addEventListener('statechanged', wrappedCb);
                        return () => {
                            eureka.redux.target.removeEventListener('statechanged', wrappedCb);
                        };
                    }
                };
            }
        } catch (e) {
            log.error(
                formatMessage({
                    id: 'eureka.failedToGetRedux',
                    default: 'Failed to get Redux.'
                })
                , '\n', e);
        }
    }
};

// Second trap - Using React internal Redux store
const trapViaReduxStore = () => {
    if (vmTrapped) return;
    try {
        const store = getReduxStoreFromDOM();
        const vm = store?.getState()?.scratchGui?.vm;
        if (vm) {
            log.info(formatMessage({
                id: 'eureka.trap.vm.detected',
                default: 'VM detected!'
            }));
            vmTrapped = true;
            eureka.vm = vm;
            if (settings.trap.blocks) {
                getScratchBlocksInstance(vm).then(blocks => {
                    eureka.blocks = blocks;
                    log.info(
                        formatMessage({
                            id: 'eureka.blocksReady',
                            default: 'ScratchBlocks is ready.'
                        })
                    );
                    if (settings.behavior.polyfillGlobalInstances && typeof globalThis.ScratchBlocks === 'undefined') {
                        globalThis.ScratchBlocks = eureka.blocks;
                    }

                    if (!settings.behavior.headless) {
                        applyPatchesForBlocks(eureka.blocks);
                    }
                })
                    .catch(e => {
                        log.error(
                            formatMessage({
                                id: 'eureka.failedToGetBlocks',
                                default: 'Failed to get ScratchBlocks.'
                            })
                            , '\n', e);
                    });
            }

            if (settings.behavior.polyfillGlobalInstances && typeof globalThis.vm === 'undefined') {
                globalThis.vm = vm;
            }
            setLocale(vm.getLocale());

            if (settings.behavior.headless) {
                log.warn(
                    formatMessage({
                        id: 'eureka.headlessTips',
                        default: 'Headless mode on, stop apply patches.'
                    })
                );
            } else {
                applyPatchesForVM(vm, eureka);
            }

            if (settings.behavior.polyfillGlobalInstances && typeof globalThis.ReduxStore === 'undefined') {
                globalThis.ReduxStore = store;
            }
        }
    } catch (e) {
        log.error(
            formatMessage({
                id: 'eureka.failedToGetVM',
                default: 'Failed to get VM.'
            })
            , '\n', e);
    }
};

// eslint-disable-next-line no-negated-condition
if (document.readyState !== 'complete') {
    // Run both traps with race condition
    trapViaBind();
    trapRedux();
    
    // Second trap with 1s timeout, Since it's expensive
    setTimeout(() => {
        if (!vmTrapped) {
            trapViaReduxStore();
        }
    }, 1000);
} else {
    log.warn(
        formatMessage({
            id: 'eureka.loadingLate',
            default: 'Eureka loads too late, trying to get Redux from DOM..'
        })
    );
    // Only try Redux store trap for complete states
    trapViaReduxStore();
}

if (settings.behavior.exposeCtx) {
    globalThis.eureka = eureka;
}
