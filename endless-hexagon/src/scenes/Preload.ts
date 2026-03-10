import Phaser from 'phaser';

export default class Preload extends Phaser.Scene {

    constructor() {
        super("Preload");
    }

    create() {
        this.scene.start("Scene");
    }
}
