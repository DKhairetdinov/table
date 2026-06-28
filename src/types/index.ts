import type React from "react";

export interface Cell {
  rawValue: string;
  computedData: string | number | boolean | null;
}
export interface GridCellProps {
  address: string;
  rawValue: string;
  computedData: string | number | boolean | null;
  isActive: boolean;
  isEditing: boolean;
  onSelect: (address: string) => void;
  onDoubleClick: (address: string) => void;
  onFinishEdit: (address: string, value: string) => void;
  onUpdate: (address: string, value: string) => void;
  style?: React.CSSProperties;
}
