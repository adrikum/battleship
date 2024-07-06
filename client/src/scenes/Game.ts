import { Scene } from 'phaser';
import { BattleshipGrid } from '../elements/BattleshipGrid';
import { PlayerConfig, PlayerNo, RoomConfig } from '../shared/models';
import { socket } from '../main';

export class Game extends Scene {
  camera: Phaser.Cameras.Scene2D.Camera;
  background: Phaser.GameObjects.Image;
  gameText: Phaser.GameObjects.Text;

  private attackGrid: BattleshipGrid;
  private defenseGrid: BattleshipGrid;

  private ownPlayerNo: PlayerNo;
  private roomConfig: RoomConfig;
  private playerConfig: PlayerConfig;

  private gridSize = 8;
  private cellSize = 70;
  private offsetY = 270;
  private offsetX = 200;
  private additionalOffsetX = 960 + 50;

  private defaultFont: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: 'Arial Rounded MT',
    color: '#000000',
  };

  constructor() {
    super('Game');

    this.attackGrid = new BattleshipGrid({
      gridOffsetX: this.offsetX,
      gridOffsetY: this.offsetY,
      cellSize: this.cellSize,
    });

    this.defenseGrid = new BattleshipGrid({
      gridOffsetX: this.offsetX + this.additionalOffsetX,
      gridOffsetY: this.offsetY,
      cellSize: this.cellSize,
    });

    socket.on('attack', (args) => {
      const x = args.coord.x;
      const y = args.coord.y;
      ((grid: BattleshipGrid) => {
        const { xPx, yPx } = grid.getGridCellToCoordinate(x, y);
        this.drawMove(xPx, yPx, args.hit);
        this.drawFrame(xPx, yPx);
        if (args.sunkenShip) {
          const shipCount = grid.getShipCount();
          shipCount[args.sunkenShip.ship.size - 1]--;
          grid.updateShipCount(shipCount);
        }
      })(args.playerNo === this.ownPlayerNo ? this.attackGrid : this.defenseGrid);
    });

    socket.on('gameOver', (args) => {
      this.scene.start('GameOver', { winner: args.winner, playerConfig: this.playerConfig });
    });
  }

  preload() {
    this.load.svg('ships', 'assets/ships.svg', { width: 200, height: 800 });
    this.load.svg('explosion', 'assets/explosion.svg', { width: 60, height: 60 });
    this.load.svg('dot', 'assets/dot.svg', { width: 12, height: 12 });
    this.load.svg('pencil', 'assets/pencil.svg', { width: 40, height: 40 });
  }

  create(args: { roomConfig: RoomConfig; playerConfig: PlayerConfig; ownPlayerNo: PlayerNo }) {
    this.camera = this.cameras.main;
    this.camera.setBackgroundColor(0xffffff);

    this.ownPlayerNo = args.ownPlayerNo;
    this.roomConfig = args.roomConfig;
    this.playerConfig = args.playerConfig;

    // this.background = this.add.image(512, 384, 'background');
    // this.background.setAlpha(0.5);

    this.drawGrid(this.offsetX, 'l');
    this.drawGrid(this.offsetX + this.additionalOffsetX, 'r');
    this.drawPlayerNames();
    this.drawShipCount();
    this.addInputCanvas();
    this.drawInstructions();
  }

  private drawGrid(offsetX: number, legendPosition: 'r' | 'l') {
    for (let row = 0; row < this.gridSize; row++) {
      this.add.text(
        offsetX + 25 + this.cellSize * row,
        this.offsetY - 35,
        String.fromCharCode(65 + row),
        Object.assign({}, this.defaultFont, {
          fontSize: 24,
        }),
      );
      this.add.text(
        legendPosition === 'r' ? offsetX + 15 + this.cellSize * this.gridSize : offsetX - 30,
        this.offsetY + 20 + this.cellSize * row,
        (row + 1).toString(),
        Object.assign({}, this.defaultFont, {
          fontSize: 24,
        }),
      );
      for (let col = 0; col < this.gridSize; col++) {
        const x = offsetX + col * this.cellSize;
        const y = this.offsetY + row * this.cellSize;
        this.add.rectangle(x, y, this.cellSize, this.cellSize).setStrokeStyle(4, 0x000000).setOrigin(0);
      }
    }
  }

  private drawPlayerNames() {
    this.add
      .text(
        this.offsetX + this.additionalOffsetX,
        this.offsetY - 100,
        `You: ${this.playerConfig[this.ownPlayerNo]}`,
        Object.assign(this.defaultFont, {
          fontSize: 36,
        }),
      )
      .setOrigin(0, 1);
    this.add
      .text(
        this.offsetX,
        this.offsetY - 100,
        `Your opponent: ${this.playerConfig[((this.ownPlayerNo + 1) % 2) as PlayerNo]}`,
        Object.assign({}, this.defaultFont, {
          fontSize: 36,
        }),
      )
      .setOrigin(0, 1);
  }

  private drawShipCount() {
    this.add.image(980 + 50, this.offsetY + 290, 'ships');
    for (let i = 0; i < 4; i++) {
      this.attackGrid.shipCountReference.push(
        this.add.text(
          845 + 50,
          this.offsetY + 20 + i * 140,
          '',
          Object.assign({}, this.defaultFont, {
            fontSize: 24,
          }),
        ),
      );
      this.defenseGrid.shipCountReference.push(
        this.add.text(
          1075 + 50,
          this.offsetY + 20 + i * 140,
          '',
          Object.assign({}, this.defaultFont, {
            fontSize: 24,
          }),
        ),
      );
    }
    this.attackGrid.updateShipCount(this.roomConfig.availableShips);
    this.defenseGrid.updateShipCount(this.roomConfig.availableShips);
  }

  private addInputCanvas() {
    const canvas = this.add
      .rectangle(
        this.offsetX - this.cellSize,
        this.offsetY - this.cellSize,
        (this.gridSize + 2) * this.cellSize,
        (this.gridSize + 2) * this.cellSize,
      )
      .setOrigin(0)
      .setStrokeStyle(4, 0xff0000, 0.2);
    const pencil = this.add
      .image(
        this.offsetX + this.gridSize * this.cellSize + 40,
        this.offsetY + this.gridSize * this.cellSize + 40,
        'pencil',
      )
      .setAlpha(0.2);
    let gesturePositions: Phaser.Math.Vector2[];
    let graphics: Phaser.GameObjects.Graphics | undefined;
    let lastPosition: Phaser.Math.Vector2 | undefined;
    let drawing = false;

    canvas.setInteractive();
    canvas.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) {
        const { x, y } = this.attackGrid.getCoordinateToGridCell(pointer.x, pointer.y);
        socket.emit('attack', { coord: { x: x, y: y } }, (error?: string) => {
          if (error) {
            console.log(error);
          }
        });
      }
      if (pointer.rightButtonDown()) {
        drawing = true;
        gesturePositions = [];
        canvas.setStrokeStyle(4, 0xff0000, 1);
        pencil.setAlpha(1);
        lastPosition = pointer.position.clone();
        graphics = this.add.graphics();
      }
    });
    canvas.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (drawing && graphics && lastPosition) {
        graphics
          .lineStyle(7, 0xff0000, 1)
          .beginPath()
          .moveTo(lastPosition.x, lastPosition.y)
          .lineTo(pointer.position.x, pointer.position.y)
          .strokePath()
          .closePath();
        lastPosition = pointer.position.clone();
        gesturePositions.push(lastPosition);
      }
    });
    const stopDrawing = () => {
      if (drawing && graphics) {
        drawing = false;
        console.log(gesturePositions);
        canvas.setStrokeStyle(4, 0xff0000, 0.2);
        pencil.setAlpha(0.2);
        graphics.destroy();
      }
    };
    canvas.on('pointerup', () => {
      stopDrawing();
    });
    canvas.on('pointerout', () => {
      stopDrawing();
    });
  }

  private drawInstructions() {
    this.add
      .text(
        this.offsetX,
        this.offsetY + this.cellSize * this.gridSize + 100,
        `Try to guess the position of your opponent's ships! Use point-and-click or gesture input by right-clicking and drawing in the designated area.\nTo connect Alexa, use the code: ${this.roomConfig.roomId.toString()}${this.ownPlayerNo.toString()}`,
        Object.assign({}, this.defaultFont, {
          fontSize: 24,
        }),
      )
      .setOrigin(0);
  }

  private drawMove(xPx: number, yPx: number, hit: boolean) {
    this.add.image(xPx + 35, yPx + 35, hit ? 'explosion' : 'dot');
  }

  private drawFrame(x: number, y: number) {
    const frame = this.add.rectangle(x, y, 50, 50, 0xffffff);
    frame.setAlpha(0);
    frame.setStrokeStyle(6, 0xc10307).setOrigin(0).strokeColor;
  }
}
