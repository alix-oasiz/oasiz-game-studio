declare module "webfontloader" {
    interface WebFontConfig {
        google?: {
            families: string[];
        };
        custom?: {
            families: string[];
            urls?: string[];
        };
        active?: () => void;
        inactive?: () => void;
    }

    const WebFont: {
        load(config: WebFontConfig): void;
    };

    export default WebFont;
}
