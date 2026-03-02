import { InputManager } from "./Input";
import { MultiInputManager } from "./MultiInputManager";
import { NetworkManager } from "../../network/NetworkManager";
import { PlayerInput, GamePhase, GAME_CONFIG } from "../../types";
import { NETWORK_GAME_FEEL_TUNING } from "../../network/gameFeel/NetworkGameFeelTuning";

export class PlayerInputResolver {
  private localInputState: PlayerInput = {
    buttonA: false,
    buttonB: false,
    timestamp: 0,
    clientTimeMs: 0,
    inputSequence: 0,
  };
  private lastInputSendTime: number = 0;
  private nextInputSequence = 1;
  private lastSentButtons: { buttonA: boolean; buttonB: boolean } | null = null;
  private lastObservedPhase: GamePhase | null = null;

  constructor(
    private network: NetworkManager,
    private input: InputManager,
    private multiInput: MultiInputManager | null,
  ) {}

  captureLocalInput(now: number, useTouchForHost: boolean): PlayerInput {
    const capturedInput = useTouchForHost
      ? this.multiInput?.capture(0) || this.emptyInput()
      : this.input.capture();

    this.localInputState = {
      ...capturedInput,
      timestamp: now,
      clientTimeMs: now,
      inputSequence: this.localInputState.inputSequence,
    };

    return this.localInputState;
  }

  sendLocalInputIfNeeded(now: number, phase: GamePhase): PlayerInput | null {
    if (this.network.isSimulationAuthority()) return null;
    const phaseAllowsGameplayInput =
      phase === "COUNTDOWN" || phase === "PLAYING";
    const previousPhaseAllowedGameplayInput =
      this.lastObservedPhase === "COUNTDOWN" ||
      this.lastObservedPhase === "PLAYING";
    const enteredGameplayInputPhase =
      phaseAllowsGameplayInput && !previousPhaseAllowedGameplayInput;
    this.lastObservedPhase = phase;
    if (!phaseAllowsGameplayInput) return null;

    const sendIntervalMs =
      this.network.getTransportMode() === "online"
        ? NETWORK_GAME_FEEL_TUNING.selfPrediction.inputSendIntervalMs
        : GAME_CONFIG.SYNC_INTERVAL;
    const buttonsChanged =
      this.lastSentButtons === null ||
      this.lastSentButtons.buttonA !== this.localInputState.buttonA ||
      this.lastSentButtons.buttonB !== this.localInputState.buttonB;
    if (
      !enteredGameplayInputPhase &&
      !buttonsChanged &&
      now - this.lastInputSendTime < sendIntervalMs
    ) {
      return null;
    }

    const inputSequence = this.nextInputSequence++;

    const sendInput: PlayerInput = {
      ...this.localInputState,
      timestamp: now,
      clientTimeMs: now,
      inputSequence,
    };
    this.network.sendInput(sendInput);
    this.localInputState.inputSequence = inputSequence;
    this.lastSentButtons = {
      buttonA: sendInput.buttonA,
      buttonB: sendInput.buttonB,
    };
    this.lastInputSendTime = now;
    return sendInput;
  }

  getCurrentInputState(): PlayerInput {
    return this.localInputState;
  }

  private emptyInput(): PlayerInput {
    return {
      buttonA: false,
      buttonB: false,
      timestamp: 0,
      clientTimeMs: 0,
      inputSequence: 0,
    };
  }
}
