import { Scene } from 'phaser';
import { BattleshipGrid } from '../elements/BattleshipGrid';
import { Coord, Modality, PlayerConfig, PlayerNo, RoomConfig } from '../shared/models';
import { socket, gameRadio, defaultFont } from '../main';
import { GestureRecognition, Gestures } from '../elements/GestureRecognition';

export class Game extends Scene {
  camera: Phaser.Cameras.Scene2D.Camera;
  background: Phaser.GameObjects.Image;
  gameText: Phaser.GameObjects.Text;

  private attackGrid: BattleshipGrid;
  private defenseGrid: BattleshipGrid;
  private gestureRecognition: GestureRecognition;

  private ownPlayerNo: PlayerNo;
  private roomConfig: RoomConfig;
  private playerConfig: PlayerConfig;

  private gridSize = 8;
  private cellSize = 70;
  private offsetY = 250;
  private offsetX = 200;
  private additionalOffsetX = 960 + 50;

  private frame: Phaser.GameObjects.Rectangle;
  private framePosition = { x: 0, y: 0 };

  private lock = false;

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
    this.gestureRecognition = new GestureRecognition();
  }

  create(args: { roomConfig: RoomConfig; playerConfig: PlayerConfig; ownPlayerNo: PlayerNo }) {
    this.camera = this.cameras.main;
    this.camera.setBackgroundColor(0xffffff);
    this.add.image(0, 0, 'background').setOrigin(0).setAlpha(0.2, 0.3, 0, 0.1);

    this.ownPlayerNo = args.ownPlayerNo;
    this.roomConfig = args.roomConfig;
    this.playerConfig = args.playerConfig;

    this.drawGrid(this.offsetX, 'l');
    this.drawGrid(this.offsetX + this.additionalOffsetX, 'r');
    this.drawPlayerNames();
    this.drawShipCount();
    this.addInputCanvas();
    this.addInputListeners();
    this.drawInstructions();

    gameRadio.drawRadio(this);
    gameRadio.sendMessage(`${this.playerConfig[args.playerConfig.firstTurn]} begins`);

    socket.on('attack', (args) => {
      const x = args.coord.x;
      const y = args.coord.y;
      ((grid: BattleshipGrid) => {
        const { xPx, yPx } = grid.getGridCellToCoordinate(x, y);
        const tint = {
          [Modality.POINT_AND_ClICK]: 0x000000,
          [Modality.VOICE]: 0x0047ab,
          [Modality.GESTURE]: 0xd2042d,
          [Modality.KEYBOARD]: 0x1c7b1c,
        }[args.modality];
        this.drawMove(xPx, yPx, args.hit, tint);
        if (args.sunkenShip) {
          const shipCount = grid.getShipCount();
          shipCount[args.sunkenShip.ship.size - 1]--;
          grid.updateShipCount(shipCount);
          const attackedPlayer = this.playerConfig[((args.playerNo + 1) % 2) as PlayerNo];
          gameRadio.sendMessage(
            `${attackedPlayer}'${attackedPlayer.slice(-1) === 's' ? '' : 's'} ship (size ${args.sunkenShip.ship.size}) was sunk`,
          );
        }
      })(args.playerNo === this.ownPlayerNo ? this.attackGrid : this.defenseGrid);
    });

    socket.on('gameOver', (args) => {
      this.scene.start('GameOver', {
        winner: args.winner,
        playerConfig: this.playerConfig,
        ownPlayerNo: this.ownPlayerNo,
      });
    });
  }

  private drawGrid(offsetX: number, legendPosition: 'r' | 'l') {
    for (let row = 0; row < this.gridSize; row++) {
      this.add.text(offsetX + 25 + this.cellSize * row, this.offsetY - 35, String.fromCharCode(65 + row), defaultFont);
      this.add.text(
        legendPosition === 'r' ? offsetX + 15 + this.cellSize * this.gridSize : offsetX - 30,
        this.offsetY + 20 + this.cellSize * row,
        (row + 1).toString(),
        defaultFont,
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
      .text(this.offsetX + this.additionalOffsetX, this.offsetY - 100, `You: ${this.playerConfig[this.ownPlayerNo]}`, {
        ...defaultFont,
        fontSize: 36,
      })
      .setOrigin(0, 1);
    this.add
      .text(
        this.offsetX,
        this.offsetY - 100,
        `Your opponent: ${this.playerConfig[((this.ownPlayerNo + 1) % 2) as PlayerNo]}`,
        { ...defaultFont, fontSize: 36 },
      )
      .setOrigin(0, 1);
  }

  private drawShipCount() {
    this.add.image(980 + 50, this.offsetY + 290, 'ships');
    for (let i = 0; i < 4; i++) {
      this.attackGrid.shipCountReference.push(this.add.text(845 + 50, this.offsetY + 20 + i * 140, '', defaultFont));
      this.defenseGrid.shipCountReference.push(this.add.text(1075 + 50, this.offsetY + 20 + i * 140, '', defaultFont));
    }
    this.attackGrid.updateShipCount(this.roomConfig.availableShips);
    this.defenseGrid.updateShipCount(this.roomConfig.availableShips);
  }

  private attackErrorHandler = (error?: string) => {
    if (error) {
      console.warn(error);
      gameRadio.sendMessage('Error: ' + error);
      // todo error code mitsenden und manche meldungen unterdrücken
    }
  };

  private addInputCanvas() {
    const canvas = this.add
      .rectangle(
        this.offsetX - this.cellSize,
        this.offsetY - this.cellSize,
        (this.gridSize + 2) * this.cellSize,
        (this.gridSize + 2) * this.cellSize,
      )
      .setOrigin(0)
      .setStrokeStyle(4, 0xd2042d, 0.2);
    const pencil = this.add
      .image(
        this.offsetX + this.gridSize * this.cellSize + 40,
        this.offsetY + this.gridSize * this.cellSize + 40,
        'pencil',
      )
      .setAlpha(0.2);
    let gestureCoords: Coord[];
    let graphics: Phaser.GameObjects.Graphics | undefined;
    let lastPosition: Phaser.Math.Vector2 | undefined;
    let drawing = false;

    canvas.setInteractive();
    canvas.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.frame) {
        this.framePosition = { x: 0, y: 0 };
        this.frame.destroy();
      }

      if (pointer.leftButtonDown()) {
        if (this.lock) {
          console.warn('The gesture Input is currently being used');
          gameRadio.sendMessage('The gesture Input is currently being used');
          return;
        }
        const { x, y } = this.attackGrid.getCoordinateToGridCell(pointer.x, pointer.y);
        socket.emit('attack', { coord: { x, y }, modality: Modality.POINT_AND_ClICK }, this.attackErrorHandler);
      } else if (pointer.rightButtonDown()) {
        this.lock = true;
        socket.emit('lock', { locked: this.lock }, this.attackErrorHandler);
        drawing = true;
        gestureCoords = [];
        canvas.setStrokeStyle(4, 0xd2042d, 1);
        pencil.setAlpha(1);
        lastPosition = pointer.position.clone();
        graphics = this.add.graphics();
      }
    });
    canvas.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (drawing && graphics && lastPosition) {
        graphics
          .lineStyle(6, 0xd2042d, 1)
          .beginPath()
          .moveTo(lastPosition.x, lastPosition.y)
          .lineTo(pointer.position.x, pointer.position.y)
          .strokePath()
          .closePath();
        lastPosition = pointer.position.clone();
        gestureCoords.push({ x: Math.round(lastPosition.x), y: Math.round(lastPosition.y) });
      }
    });
    const stopDrawing = () => {
      if (drawing && graphics) {
        this.lock = false;
        socket.emit('lock', { locked: this.lock }, this.attackErrorHandler);
        drawing = false;
        canvas.setStrokeStyle(4, 0xd2042d, 0.2);
        pencil.setAlpha(0.2);
        graphics.destroy();
        const { gesture, d } = this.gestureRecognition.getGesture(gestureCoords);
        if (d > 1000) {
          gameRadio.sendMessage("Gesture couldn't be recognized with sufficient certainty");
        } else {
          gameRadio.sendMessage(`Gesture "${this.gestureRecognition.getGestureName(gesture)}" was recognized`);
          if (gesture === Gestures.CIRCLE) {
            socket.emit(
              'attack',
              { coord: { x: 0, y: 0 }, randomCoord: true, modality: Modality.GESTURE },
              this.attackErrorHandler,
            );
            // todo die Koordinate wird noch übermittelt; evtl. kann das der Startpunkt für weitere Funktionalitäten sein
          } else {
            const snakeMovement = {
              [Gestures.ARROW_UP]: { up: 1, right: 0 },
              [Gestures.ARROW_DOWN]: { up: -1, right: 0 },
              [Gestures.ARROW_RIGHT]: { up: 0, right: 1 },
              [Gestures.ARROW_LEFT]: { up: 0, right: -1 },
            }[gesture];
            socket.emit(
              'attack',
              { coord: { x: 0, y: 0 }, snakeMovement: snakeMovement, modality: Modality.GESTURE },
              this.attackErrorHandler,
            );
          }
        }
      }
    };
    canvas.on('pointerup', stopDrawing);
    canvas.on('pointerout', stopDrawing);
  }

  private drawInstructions() {
    this.add
      .text(
        this.offsetX + this.additionalOffsetX,
        this.offsetY - 55,
        `To connect Alexa, use the code: ${this.roomConfig.roomId}${this.ownPlayerNo}`,
        defaultFont,
      )
      .setOrigin(0, 1);
    this.add
      .image(this.offsetX + this.additionalOffsetX + this.cellSize - 10, 900, 'circle-gesture-instruction')
      .setOrigin(1);
    this.add
      .image(this.offsetX + this.additionalOffsetX + this.cellSize - 20, 975, 'arrow-gestures-instruction')
      .setOrigin(1);
    this.add
      .text(
        this.offsetX + this.additionalOffsetX + this.cellSize + 10,
        880,
        'Attack randomly by drawing a circle',
        defaultFont,
      )
      .setOrigin(0, 1);
    this.add
      .text(
        this.offsetX + this.additionalOffsetX + this.cellSize + 10,
        936,
        'Use snake control by drawing arrows',
        defaultFont,
      )
      .setOrigin(0, 1);
    this.add
      .text(
        this.offsetX + this.additionalOffsetX + this.cellSize + 10,
        968,
        '(draw by right-clicking in the red box)',
        defaultFont,
      )
      .setOrigin(0, 1);
  }

  private drawMove(xPx: number, yPx: number, hit: boolean, tint: number) {
    this.add.image(xPx + 35, yPx + 35, hit ? 'explosion' : 'dot').setTint(tint);
  }

  private addInputListeners() {
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-UP', () => {
        this.drawFrame(0, -1);
      });
      this.input.keyboard.on('keydown-DOWN', () => {
        this.drawFrame(0, 1);
      });
      this.input.keyboard.on('keydown-LEFT', () => {
        this.drawFrame(-1, 0);
      });
      this.input.keyboard.on('keydown-RIGHT', () => {
        this.drawFrame(1, 0);
      });
      this.input.keyboard.on('keydown-ENTER', () => {
        if (this.lock) {
          console.warn('The gesture Input is currently being used');
          gameRadio.sendMessage('The gesture Input is currently being used');
          return;
        }
        if (this.frame) {
          socket.emit(
            'attack',
            { coord: { x: this.framePosition.x, y: this.framePosition.y }, modality: Modality.KEYBOARD },
            this.attackErrorHandler,
          );
        }
      });
    }
  }

  private drawFrame(byX: number, byY: number) {
    if (this.lock) {
      console.warn('The gesture Input is currently being used');
      gameRadio.sendMessage('The gesture Input is currently being used');
      return;
    }

    this.framePosition.x = Phaser.Math.Clamp(this.framePosition.x + byX, 0, this.gridSize - 1);
    this.framePosition.y = Phaser.Math.Clamp(this.framePosition.y + byY, 0, this.gridSize - 1);
    const { xPx, yPx } = this.attackGrid.getGridCellToCoordinate(this.framePosition.x, this.framePosition.y);

    if (this.frame) {
      this.frame.destroy();
    }

    this.frame = this.add.rectangle(xPx, yPx, this.cellSize, this.cellSize);
    this.frame.setStrokeStyle(6, 0x1c7b1c).setOrigin(0);
  }
}
