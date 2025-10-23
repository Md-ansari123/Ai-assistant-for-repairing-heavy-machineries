// Bounding box for AR annotations
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// A single step in the repair guide
export interface RepairStep {
  description: string;
  boundingBox?: BoundingBox; // Optional bounding box
}

export interface RepairGuideResponse {
  diagnosis: string;
  estimatedCost: string;
  machineDowntime: string;
  manualLaborTime: string;
  partAvailability: string;
  requiredTools: string[];
  requiredMaterials: string[];
  safetyWarnings: string[];
  repairSteps: RepairStep[]; // Changed from string[]
  preventativeMaintenance: string[];
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface RepairHistoryItem {
  id: string;
  timestamp: number;
  description: string;
  guide: RepairGuideResponse;
  mediaFileUrl?: string; // Add mediaFileUrl to history
}

// Component identified in Live AR mode
export interface ArComponent {
  name: string;
  boundingBox: BoundingBox;
}