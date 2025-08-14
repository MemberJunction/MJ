export interface ModuleProperty {
  type: 'text' | 'number' | 'textarea' | 'select';
  label: string;
  default: any;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

export interface ModuleType {
  name: string;
  icon: string;
  color: string;
  properties: { [key: string]: ModuleProperty };
}

export interface Module {
  id: string;
  type: string;
  name: string;
  icon: string;
  color: string;
  properties: { [key: string]: any };
}

export interface NodeData {
  name: string;
  modules: Module[];
  position?: [number, number];
}