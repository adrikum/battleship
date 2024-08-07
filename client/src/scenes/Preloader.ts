import { Scene } from 'phaser';

export class Preloader extends Scene {
  constructor() {
    super('Preloader');
  }

  init() {
    //  We loaded this image in our Boot Scene, so we can display it here
    this.add.image(0, 0, 'background').setOrigin(0).setAlpha(0.2);

    //  A simple progress bar. This is the outline of the bar.
    this.add.rectangle(980, 460, 468, 32).setStrokeStyle(1, 0xffffff);

    //  This is the progress bar itself. It will increase in size from the left based on the % of progress.
    const bar = this.add.rectangle(980 - 230, 460, 4, 28, 0xffffff);

    //  Use the 'progress' event emitted by the LoaderPlugin to update the loading bar
    this.load.on('progress', (progress: number) => {
      //  Update the progress bar (our bar is 464px wide, so 100% = 464px)
      bar.width = 4 + 460 * progress;
    });
  }

  preload() {
    //  Load the assets for the game - Replace with your own assets
    this.load.setPath('assets');

    // global
    this.load.svg('radio', 'radio.svg', { width: 60, height: 60 });

    // for MainMenu
    this.load.image('logo', 'logo.png');
    this.load.svg('captain', 'captain.svg', { width: 100, height: 100 });

    // for Game scene
    this.load.svg('ships', 'ships.svg', { width: 200, height: 800 });
    this.load.image('explosion', 'explosion.png'); // 60x60
    this.load.image('dot', 'dot.png'); // 12x12
    this.load.svg('pencil', 'pencil.svg', { width: 40, height: 40 });
    this.load.svg('arrow-gestures-instruction', 'arrow-gestures-instruction.svg', { width: 226.8, height: 60 });
    this.load.svg('circle-gesture-instruction', 'circle-gesture-instruction.svg', { width: 60, height: 60 });
  }

  create() {
    //  When all the assets have loaded, it's often worth creating global objects here that the rest of the game can use.
    //  For example, you can define global animations here, so we can use them in other scenes.

    //  Move to the MainMenu. You could also swap this for a Scene Transition, such as a camera fade.
    this.add.image(0, 0, 'background').setOrigin(0).setAlpha(0.2);
    this.scene.start('MainMenu');
  }
}
