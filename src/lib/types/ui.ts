// Props shapes shared by the four panels — kept separate from the engine
// types so panels only ever receive the read-only slice of SessionState
// they need (docs/data-model.md "How this ties the panels together").

import type { CharacterState, MapGraphState, TurnLogEntry } from "./state";

export interface NarrationPanelProps {
  log: TurnLogEntry[];
  onSubmit: (input: string) => void;
  pending?: boolean;
}

export interface MapPanelProps {
  map: MapGraphState;
  currentTileId: string;
}

export interface CharacterPanelProps {
  members: CharacterState[];
}

export interface InventoryPanelProps {
  members: CharacterState[];
}
