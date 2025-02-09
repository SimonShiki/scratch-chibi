/**
 * @import { DashboardStatus } from "../main/dashboard/app";
 * @import { EuRedux } from "../main/trap/redux";
 */

interface EurekaContext {
    declaredIds: string[];
    idToURLMapping: Map<string, string>;
    vm?: DucktypedVM;
    redux?: EuRedux;
    version: string;
    blocks?: DucktypedScratchBlocks | undefined;
    openDashboard?(status?: DashboardStatus): void;
    closeDashboard?(): void;
    load?(url: string): Promise<void>;
}

/* eslint-disable no-var */
declare var Blockly: DucktypedScratchBlocks;
declare var eureka: EurekaContext | undefined;
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
declare var __REDUX_DEVTOOLS_EXTENSION_COMPOSE__: Function | undefined;
declare var __scratchAddonsRedux: EuRedux | undefined;
