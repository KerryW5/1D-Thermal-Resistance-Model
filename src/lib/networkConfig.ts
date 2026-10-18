import {
	ABSOLUTE_ZERO_C,
	MAX_LAYERS,
	MAX_TRANSIENT_OUTPUT_STEPS,
	type InterfaceType,
	type NetworkInputs,
	type ValidationIssue,
} from './thermalModel.ts';

export type SurfaceFinish = 'bare' | 'foil' | 'custom';
export type ModelMode = 'steady' | 'transient';

export interface SurfaceState {
	finish: SurfaceFinish;
	emissivity: number;
}

export interface LayerState {
	id: string;
	label: string;
	materialId: string;
	thicknessMm: number;
	conductivityWmK: number;
	densityKgM3: number;
	specificHeatJkgK: number;
	bareEmissivity: number;
	frontSurface: SurfaceState;
	backSurface: SurfaceState;
}

export interface InterfaceState {
	type: InterfaceType;
	gapThicknessMm: number;
	adhesiveThicknessMm: number;
	adhesiveConductivityWmK: number;
	contactResistanceM2KW: number;
}

export interface NetworkState {
	templateId: string;
	modelMode: ModelMode;
	timeStepS: number;
	finalTimeS: number;
	initialTemperatureC: number;
	sourceTemperatureC: number;
	sourceBareEmissivity: number;
	sourceSurface: SurfaceState;
	ambientTemperatureC: number;
	backConvectionWm2K: number;
	layers: LayerState[];
	interfaces: InterfaceState[];
	foilEmissivity: number;
	airFitIntercept: number;
	airFitSlope: number;
	toleranceK: number;
	maxIterations: number;
	relaxation: number;
}

export interface MaterialPreset {
	id: string;
	name: string;
	description: string;
	conductivityWmK: number;
	densityKgM3: number;
	specificHeatJkgK: number;
	bareEmissivity: number;
	defaultThicknessMm: number;
}

export interface NetworkTemplate {
	id: string;
	name: string;
	description: string;
	sourceTemperatureC: number;
	ambientTemperatureC: number;
	sourceBareEmissivity: number;
	sourceSurface: SurfaceState;
	backConvectionWm2K: number;
	layers: LayerState[];
	interfaces: InterfaceState[];
}

export const ADVANCED_DEFAULTS = {
	foilEmissivity: 0.05,
	airFitIntercept: 0.0243,
	airFitSlope: 7.7e-5,
	toleranceK: 1e-4,
	maxIterations: 1000,
	relaxation: 0.5,
} as const;

export const TRANSIENT_DEFAULTS = {
	timeStepS: 5,
	finalTimeS: 60,
	initialTemperatureC: 30,
} as const;

export const SOURCE_BARE_EMISSIVITY = 0.9;
export const DEFAULT_TEMPLATE_ID = 'example-two-layer';

export const SURFACE_FINISH_OPTIONS: ReadonlyArray<{ value: SurfaceFinish; label: string }> = [
	{ value: 'bare', label: 'Bare' },
	{ value: 'foil', label: 'Reflective foil' },
	{ value: 'custom', label: 'Custom ε' },
];

export const INTERFACE_TYPE_OPTIONS: ReadonlyArray<{ value: InterfaceType; label: string }> = [
	{ value: 'air-gap', label: 'Air gap' },
	{ value: 'bonded', label: 'Bonded' },
	{ value: 'adhesive', label: 'Adhesive layer' },
	{ value: 'contact', label: 'Contact resistance' },
];

export const INTERFACE_TYPE_LABELS: Record<InterfaceType, string> = {
	'air-gap': 'Air gap',
	bonded: 'Bonded',
	adhesive: 'Adhesive layer',
	contact: 'Contact resistance',
};

export const MATERIAL_PRESETS: ReadonlyArray<MaterialPreset> = [
	{
		id: 'carbon-fibre',
		name: 'Carbon fibre composite',
		description: 'Through-thickness composite conductivity.',
		conductivityWmK: 0.8,
		densityKgM3: 1600,
		specificHeatJkgK: 1000,
		bareEmissivity: 0.88,
		defaultThicknessMm: 3,
	},
	{
		id: 'nomex',
		name: 'Nomex honeycomb',
		description: 'Lightweight honeycomb core.',
		conductivityWmK: 0.06,
		densityKgM3: 48,
		specificHeatJkgK: 1200,
		bareEmissivity: 0.9,
		defaultThicknessMm: 10,
	},
	{
		id: 'glass-fibre',
		name: 'Glass fibre composite',
		description: 'Through-thickness laminate conductivity.',
		conductivityWmK: 0.4,
		densityKgM3: 1900,
		specificHeatJkgK: 1000,
		bareEmissivity: 0.9,
		defaultThicknessMm: 3,
	},
	{
		id: 'aluminium',
		name: 'Aluminium',
		description: 'Bare metal surface.',
		conductivityWmK: 205,
		densityKgM3: 2700,
		specificHeatJkgK: 900,
		bareEmissivity: 0.1,
		defaultThicknessMm: 2,
	},
	{
		id: 'stainless-steel',
		name: 'Stainless steel',
		description: 'Bare stainless surface.',
		conductivityWmK: 16,
		densityKgM3: 7900,
		specificHeatJkgK: 500,
		bareEmissivity: 0.2,
		defaultThicknessMm: 1,
	},
	{
		id: 'aerogel',
		name: 'Aerogel blanket',
		description: 'High-performance insulation.',
		conductivityWmK: 0.015,
		densityKgM3: 120,
		specificHeatJkgK: 1000,
		bareEmissivity: 0.9,
		defaultThicknessMm: 10,
	},
	{
		id: 'custom',
		name: 'Custom material',
		description: 'Enter your own properties.',
		conductivityWmK: 0.5,
		densityKgM3: 1000,
		specificHeatJkgK: 1000,
		bareEmissivity: 0.9,
		defaultThicknessMm: 5,
	},
];

let layerIdSequence = 0;

function nextLayerId(): string {
	layerIdSequence += 1;
	return `layer-${layerIdSequence}`;
}

function surface(finish: SurfaceFinish = 'bare', emissivity = 0.9): SurfaceState {
	return { finish, emissivity };
}

export function getMaterial(materialId: string): MaterialPreset {
	return MATERIAL_PRESETS.find((material) => material.id === materialId) ?? MATERIAL_PRESETS[MATERIAL_PRESETS.length - 1];
}

export function resolveSurfaceEmissivity(
	surfaceState: SurfaceState,
	bareEmissivity: number,
	foilEmissivity: number,
): number {
	if (surfaceState.finish === 'foil') {
		return foilEmissivity;
	}
	if (surfaceState.finish === 'custom') {
		return surfaceState.emissivity;
	}
	return bareEmissivity;
}

export function createLayer(
	materialId = 'custom',
	overrides: Partial<LayerState> = {},
): LayerState {
	const material = getMaterial(materialId);
	return {
		id: nextLayerId(),
		label: material.name,
		materialId: material.id,
		thicknessMm: material.defaultThicknessMm,
		conductivityWmK: material.conductivityWmK,
		densityKgM3: material.densityKgM3,
		specificHeatJkgK: material.specificHeatJkgK,
		bareEmissivity: material.bareEmissivity,
		frontSurface: surface(),
		backSurface: surface(),
		...overrides,
	};
}

export function applyMaterialToLayer(layer: LayerState, materialId: string): LayerState {
	const material = getMaterial(materialId);
	return {
		...layer,
		label: material.name,
		materialId: material.id,
		thicknessMm: material.defaultThicknessMm,
		conductivityWmK: material.conductivityWmK,
		densityKgM3: material.densityKgM3,
		specificHeatJkgK: material.specificHeatJkgK,
		bareEmissivity: material.bareEmissivity,
	};
}

export function createInterface(
	type: InterfaceType = 'bonded',
	overrides: Partial<InterfaceState> = {},
): InterfaceState {
	return {
		type,
		gapThicknessMm: 5,
		adhesiveThicknessMm: 0.1,
		adhesiveConductivityWmK: 0.3,
		contactResistanceM2KW: 0.001,
		...overrides,
	};
}

function cloneLayer(layer: LayerState): LayerState {
	return {
		...layer,
		frontSurface: { ...layer.frontSurface },
		backSurface: { ...layer.backSurface },
	};
}

function cloneInterface(networkInterface: InterfaceState): InterfaceState {
	return { ...networkInterface };
}

const TWO_LAYER_TEMPLATE: NetworkTemplate = {
	id: 'example-two-layer',
	name: 'Carbon fibre + Nomex example',
	description: 'Heat source → 40 mm air gap → carbon fibre plate → bonded Nomex honeycomb → ambient.',
	sourceTemperatureC: 600,
	ambientTemperatureC: 30,
	sourceBareEmissivity: SOURCE_BARE_EMISSIVITY,
	sourceSurface: surface('bare', 0.9),
	backConvectionWm2K: 5,
	layers: [
		createLayer('carbon-fibre', {
			id: 'template-cfp',
			label: 'Carbon fibre plate',
			frontSurface: surface('foil', 0.05),
		}),
		createLayer('nomex', {
			id: 'template-nomex',
			label: 'Nomex honeycomb',
		}),
	],
	interfaces: [
		createInterface('air-gap', { gapThicknessMm: 40 }),
		createInterface('bonded'),
	],
};

const SOURCE_MODEL_TEMPLATE: NetworkTemplate = {
	id: 'source-model',
	name: 'Source model · 1 layer',
	description: 'Reproduces the original Python model: 40 mm air gap, 3 mm composite plate, back convection and radiation.',
	sourceTemperatureC: 600,
	ambientTemperatureC: 30,
	sourceBareEmissivity: SOURCE_BARE_EMISSIVITY,
	sourceSurface: surface('bare', 0.9),
	backConvectionWm2K: 5,
	layers: [
		createLayer('carbon-fibre', {
			id: 'template-source-plate',
			label: 'Composite plate',
			thicknessMm: 3,
			frontSurface: surface('foil', 0.05),
			backSurface: surface('bare', 0.88),
		}),
	],
	interfaces: [createInterface('air-gap', { gapThicknessMm: 40 })],
};

export const NETWORK_TEMPLATES: ReadonlyArray<NetworkTemplate> = [
	TWO_LAYER_TEMPLATE,
	SOURCE_MODEL_TEMPLATE,
];

export function getTemplate(templateId: string): NetworkTemplate | null {
	return NETWORK_TEMPLATES.find((template) => template.id === templateId) ?? null;
}

export function applyTemplate(state: NetworkState, template: NetworkTemplate): NetworkState {
	return {
		...state,
		templateId: template.id,
		sourceTemperatureC: template.sourceTemperatureC,
		ambientTemperatureC: template.ambientTemperatureC,
		sourceBareEmissivity: template.sourceBareEmissivity,
		sourceSurface: { ...template.sourceSurface },
		backConvectionWm2K: template.backConvectionWm2K,
		layers: template.layers.map(cloneLayer),
		interfaces: template.interfaces.map(cloneInterface),
	};
}

export function createInitialState(templateId = DEFAULT_TEMPLATE_ID): NetworkState {
	const template = getTemplate(templateId) ?? TWO_LAYER_TEMPLATE;
	const base: NetworkState = {
		templateId: template.id,
		modelMode: 'steady',
		...TRANSIENT_DEFAULTS,
		sourceTemperatureC: template.sourceTemperatureC,
		sourceBareEmissivity: template.sourceBareEmissivity,
		sourceSurface: { ...template.sourceSurface },
		ambientTemperatureC: template.ambientTemperatureC,
		backConvectionWm2K: template.backConvectionWm2K,
		layers: template.layers.map(cloneLayer),
		interfaces: template.interfaces.map(cloneInterface),
		...ADVANCED_DEFAULTS,
	};
	return base;
}

export function cloneNetworkState(state: NetworkState): NetworkState {
	return {
		...state,
		sourceSurface: { ...state.sourceSurface },
		layers: state.layers.map(cloneLayer),
		interfaces: state.interfaces.map(cloneInterface),
	};
}

export function buildNetworkInputs(state: NetworkState): NetworkInputs {
	return {
		sourceTemperatureC: state.sourceTemperatureC,
		ambientTemperatureC: state.ambientTemperatureC,
		sourceEmissivity: resolveSurfaceEmissivity(
			state.sourceSurface,
			state.sourceBareEmissivity,
			state.foilEmissivity,
		),
		layers: state.layers.map((layer) => ({
			id: layer.id,
			label: layer.label.trim() || 'Material layer',
			thicknessM: layer.thicknessMm / 1000,
			conductivityWmK: layer.conductivityWmK,
			densityKgM3: layer.densityKgM3,
			specificHeatJkgK: layer.specificHeatJkgK,
			frontEmissivity: resolveSurfaceEmissivity(
				layer.frontSurface,
				layer.bareEmissivity,
				state.foilEmissivity,
			),
			backEmissivity: resolveSurfaceEmissivity(
				layer.backSurface,
				layer.bareEmissivity,
				state.foilEmissivity,
			),
		})),
		interfaces: state.interfaces.map((networkInterface) => ({
			type: networkInterface.type,
			gapThicknessM: networkInterface.gapThicknessMm / 1000,
			adhesiveThicknessM: networkInterface.adhesiveThicknessMm / 1000,
			adhesiveConductivityWmK: networkInterface.adhesiveConductivityWmK,
			contactResistanceM2KW: networkInterface.contactResistanceM2KW,
		})),
		backConvectionWm2K: state.backConvectionWm2K,
		airFitIntercept: state.airFitIntercept,
		airFitSlope: state.airFitSlope,
		toleranceK: state.toleranceK,
		maxIterations: state.maxIterations,
		relaxation: state.relaxation,
	};
}

function finite(value: number): boolean {
	return typeof value === 'number' && Number.isFinite(value);
}

function validEmissivity(value: number): boolean {
	return finite(value) && value > 0 && value <= 1;
}

export function validateNetworkState(state: NetworkState): ValidationIssue[] {
	const issues: ValidationIssue[] = [];

	if (!finite(state.sourceTemperatureC)) {
		issues.push({ path: 'sourceTemperatureC', message: 'Heat source temperature must be a number.' });
	} else if (state.sourceTemperatureC <= ABSOLUTE_ZERO_C) {
		issues.push({
			path: 'sourceTemperatureC',
			message: 'Heat source temperature must be above absolute zero.',
		});
	}

	if (!finite(state.ambientTemperatureC)) {
		issues.push({ path: 'ambientTemperatureC', message: 'Ambient temperature must be a number.' });
	} else if (state.ambientTemperatureC <= ABSOLUTE_ZERO_C) {
		issues.push({ path: 'ambientTemperatureC', message: 'Ambient temperature must be above absolute zero.' });
	}

	if (
		finite(state.sourceTemperatureC) &&
		finite(state.ambientTemperatureC) &&
		state.sourceTemperatureC > ABSOLUTE_ZERO_C &&
		state.ambientTemperatureC > ABSOLUTE_ZERO_C &&
		state.sourceTemperatureC <= state.ambientTemperatureC
	) {
		issues.push({
			path: 'sourceTemperatureC',
			message: 'Heat source temperature must be greater than ambient temperature.',
		});
	}

	if (state.sourceSurface.finish === 'custom' && !validEmissivity(state.sourceSurface.emissivity)) {
		issues.push({
			path: 'sourceSurface.emissivity',
			message: 'Source surface emissivity must be greater than 0 and at most 1.',
		});
	}

	if (!finite(state.backConvectionWm2K) || state.backConvectionWm2K <= 0) {
		issues.push({
			path: 'backConvectionWm2K',
			message: 'Back-surface convection coefficient must be greater than zero.',
		});
	}

	if (state.layers.length === 0) {
		issues.push({ path: 'layers', message: 'Add at least one material layer.' });
	} else if (state.layers.length > MAX_LAYERS) {
		issues.push({ path: 'layers', message: `A network can contain at most ${MAX_LAYERS} layers.` });
	}

	if (state.interfaces.length !== state.layers.length) {
		issues.push({ path: 'interfaces', message: 'Every material layer needs an incoming connection.' });
	}

	state.layers.forEach((layer, index) => {
		const prefix = `layers.${index}`;
		if (!finite(layer.thicknessMm) || layer.thicknessMm <= 0) {
			issues.push({
				path: `${prefix}.thicknessMm`,
				message: 'Layer thickness must be greater than zero.',
			});
		}
		if (!finite(layer.conductivityWmK) || layer.conductivityWmK <= 0) {
			issues.push({
				path: `${prefix}.conductivityWmK`,
				message: 'Layer conductivity must be greater than zero.',
			});
		}
		if (layer.frontSurface.finish === 'custom' && !validEmissivity(layer.frontSurface.emissivity)) {
			issues.push({
				path: `${prefix}.frontSurface.emissivity`,
				message: 'Front-surface emissivity must be greater than 0 and at most 1.',
			});
		}
		if (layer.backSurface.finish === 'custom' && !validEmissivity(layer.backSurface.emissivity)) {
			issues.push({
				path: `${prefix}.backSurface.emissivity`,
				message: 'Back-surface emissivity must be greater than 0 and at most 1.',
			});
		}
	});

	state.interfaces.forEach((networkInterface, index) => {
		const prefix = `interfaces.${index}`;
		if (networkInterface.type === 'air-gap') {
			if (!finite(networkInterface.gapThicknessMm) || networkInterface.gapThicknessMm <= 0) {
				issues.push({
					path: `${prefix}.gapThicknessMm`,
					message: 'Air-gap thickness must be greater than zero.',
				});
			}
		}
		if (networkInterface.type === 'adhesive') {
			if (!finite(networkInterface.adhesiveThicknessMm) || networkInterface.adhesiveThicknessMm <= 0) {
				issues.push({
					path: `${prefix}.adhesiveThicknessMm`,
					message: 'Adhesive thickness must be greater than zero.',
				});
			}
			if (
				!finite(networkInterface.adhesiveConductivityWmK) ||
				networkInterface.adhesiveConductivityWmK <= 0
			) {
				issues.push({
					path: `${prefix}.adhesiveConductivityWmK`,
					message: 'Adhesive conductivity must be greater than zero.',
				});
			}
		}
		if (networkInterface.type === 'contact') {
			if (
				!finite(networkInterface.contactResistanceM2KW) ||
				networkInterface.contactResistanceM2KW < 0
			) {
				issues.push({
					path: `${prefix}.contactResistanceM2KW`,
					message: 'Contact resistance must be zero or greater.',
				});
			}
		}
	});

	if (!validEmissivity(state.foilEmissivity)) {
		issues.push({
			path: 'foilEmissivity',
			message: 'Foil emissivity must be greater than 0 and at most 1.',
		});
	}

	if (!finite(state.airFitIntercept) || state.airFitIntercept <= 0) {
		issues.push({ path: 'airFitIntercept', message: 'Air-fit intercept must be greater than zero.' });
	}

	if (!finite(state.airFitSlope) || state.airFitSlope < 0) {
		issues.push({ path: 'airFitSlope', message: 'Air-fit slope cannot be negative.' });
	}

	if (state.modelMode === 'steady') {
		if (!finite(state.toleranceK) || state.toleranceK <= 0) {
			issues.push({ path: 'toleranceK', message: 'Convergence tolerance must be greater than zero.' });
		}

		if (!finite(state.maxIterations)) {
			issues.push({ path: 'maxIterations', message: 'Maximum iterations must be a number.' });
		} else if (!Number.isInteger(state.maxIterations) || state.maxIterations < 1) {
			issues.push({
				path: 'maxIterations',
				message: 'Maximum iterations must be a whole number of at least 1.',
			});
		} else if (state.maxIterations > 100000) {
			issues.push({ path: 'maxIterations', message: 'Maximum iterations cannot exceed 100000.' });
		}

		if (!finite(state.relaxation) || state.relaxation <= 0 || state.relaxation > 1) {
			issues.push({ path: 'relaxation', message: 'Relaxation factor must be greater than 0 and at most 1.' });
		}
	}

	if (state.modelMode === 'transient') {
		if (!finite(state.timeStepS) || state.timeStepS <= 0) {
			issues.push({ path: 'timeStepS', message: 'Time step must be greater than zero.' });
		}
		if (!finite(state.finalTimeS) || state.finalTimeS <= 0) {
			issues.push({ path: 'finalTimeS', message: 'Final time must be greater than zero.' });
		}
		if (!finite(state.initialTemperatureC) || state.initialTemperatureC <= ABSOLUTE_ZERO_C) {
			issues.push({
				path: 'initialTemperatureC',
				message: 'Initial temperature must be above absolute zero.',
			});
		}
		if (
			finite(state.timeStepS) &&
			state.timeStepS > 0 &&
			finite(state.finalTimeS) &&
			state.finalTimeS > 0 &&
			Math.floor(state.finalTimeS / state.timeStepS) + 2 > MAX_TRANSIENT_OUTPUT_STEPS
		) {
			issues.push({
				path: 'finalTimeS',
				message: `This time range produces more than ${MAX_TRANSIENT_OUTPUT_STEPS} output steps. Increase the time step or shorten the final time.`,
			});
		}
		state.layers.forEach((layer, index) => {
			if (!finite(layer.densityKgM3) || layer.densityKgM3 <= 0) {
				issues.push({
					path: `layers.${index}.densityKgM3`,
					message: 'Layer density must be greater than zero.',
				});
			}
			if (!finite(layer.specificHeatJkgK) || layer.specificHeatJkgK <= 0) {
				issues.push({
					path: `layers.${index}.specificHeatJkgK`,
					message: 'Layer specific heat must be greater than zero.',
				});
			}
		});
	}

	return issues;
}
