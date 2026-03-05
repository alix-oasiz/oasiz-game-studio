import Phaser from "phaser";

export default class Boot extends Phaser.Scene {

    constructor() {
        super("Boot");
    }

    preload() {
        // We will load any necessary assets here later, but for now we draw shapes
    }

    create() {
        this.scene.start("Menu");
    }
}
