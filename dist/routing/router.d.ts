import { Request, Response } from 'express';
export declare class Router {
    private cacheManager;
    private promptProcessor;
    private routingEngine;
    private providerManager;
    private telemetry;
    constructor();
    handleChatCompletion(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    private parseRequest;
    private extractRouterHeaders;
    private createDecisionTrace;
}
export declare const router: Router;
//# sourceMappingURL=router.d.ts.map