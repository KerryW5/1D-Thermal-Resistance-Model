export const STEFAN_BOLTZMANN = 5.67e-8;
export const KELVIN_OFFSET = 273.15;
export const ABSOLUTE_ZERO_C = -273.15;
export const MAX_LAYERS = 20;
export const MAX_TRANSIENT_OUTPUT_STEPS = 10000;

const MAX_CONDUCTANCE = 1e9;

export type InterfaceType = 'air-gap' | 'bonded' | 'adhesive' | 'contact';
export type NodeKind = 'source' | 'layer-front' | 'layer-back' | 'ambient';

export interface LayerInput {
	id: string;
	label: string;
	thicknessM: number;
	conductivityWmK: number;
	densityKgM3: number;
	specificHeatJkgK: number;
	frontEmissivity: number;
	backEmissivity: number;
}

export interface InterfaceInput {
	type: InterfaceType;
	gapThicknessM?: number;
	adhesiveThicknessM?: number;
	adhesiveConductivityWmK?: number;
	contactResistanceM2KW?: number;
}

export interface NetworkInputs {
	sourceTemperatureC: number;
	ambientTemperatureC: number;
	sourceEmissivity: number;
	layers: LayerInput[];
	interfaces: InterfaceInput[];
	backConvectionWm2K: number;
	airFitIntercept: number;
	airFitSlope: number;
	toleranceK: number;
	maxIterations: number;
	relaxation: number;
}

export interface TransientSettings {
	timeStepS: number;
	finalTimeS: number;
	initialTemperatureC: number;
}

export interface TemperatureNode {
	key: string;
	label: string;
	shortLabel: string;
	temperatureC: number;
	kind: NodeKind;
	layerIndex?: number;
}

export interface InterfaceResult {
	index: number;
	type: InterfaceType;
	resistance: number;
	temperatureDropK: number;
	upstreamTemperatureC: number;
	downstreamTemperatureC: number;
	gapThicknessM?: number;
	effectiveEmissivity?: number;
	airConductivityWmK?: number;
	gapMeanTemperatureK?: number;
	conductionResistance?: number;
	radiationResistance?: number;
	radiationCoefficient?: number;
	adhesiveThicknessM?: number;
	adhesiveConductivityWmK?: number;
	contactResistanceM2KW?: number;
}

export interface LayerResult {
	index: number;
	id: string;
	label: string;
	thicknessM: number;
	conductivityWmK: number;
	frontEmissivity: number;
	backEmissivity: number;
	resistance: number;
	temperatureDropK: number;
	frontTemperatureC: number;
	backTemperatureC: number;
	meanTemperatureC: number;
}

export interface BackResult {
	resistance: number;
	temperatureDropK: number;
	convectionResistance: number;
	radiationResistance: number;
	radiationCoefficient: number;
	effectiveEmissivity: number;
	surfaceTemperatureC: number;
	ambientTemperatureC: number;
}

export interface NetworkSnapshot {
	totalResistance: number;
	sourceTemperatureC: number;
	ambientTemperatureC: number;
	layers: LayerResult[];
	interfaces: InterfaceResult[];
	back: BackResult;
	temperatureNodes: TemperatureNode[];
	airFitOutOfRange: boolean;
}

export interface ThermalNetworkResult extends NetworkSnapshot {
	iterations: number;
	converged: boolean;
	errorK: number;
	heatFluxWm2: number;
}

export interface TransientStepResult {
	timeS: number;
	nodeTemperaturesC: number[];
	layerMeanTemperaturesC: number[];
	sourceHeatFluxWm2: number | null;
	ambientHeatFluxWm2: number;
}

export interface TransientNetworkResult {
	settings: TransientSettings;
	steps: TransientStepResult[];
	final: NetworkSnapshot;
}

export interface ValidationIssue {
	path: string;
	message: string;
}

export class ThermalNetworkError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ThermalNetworkError';
	}
}

function issue(path: string, message: string): ValidationIssue {
	return { path, message };
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function validEmissivity(value: unknown): value is number {
	return isFiniteNumber(value) && value > 0 && value <= 1;
}

export function airConductivityK(
	temperatureK: number,
	intercept: number,
	slope: number,
): number {
	return intercept + slope * (temperatureK - KELVIN_OFFSET);
}

export function effectiveGapEmissivity(first: number, second: number): number {
	return 1 / (1 / first + 1 / second - 1);
}

export function validateNetworkInputs(inputs: NetworkInputs): ValidationIssue[] {
	const issues: ValidationIssue[] = [];

	if (!isFiniteNumber(inputs.sourceTemperatureC)) {
		issues.push(issue('sourceTemperatureC', 'Heat source temperature must be a number.'));
	} else if (inputs.sourceTemperatureC <= ABSOLUTE_ZERO_C) {
		issues.push(issue('sourceTemperatureC', 'Heat source temperature must be above absolute zero.'));
	}

	if (!isFiniteNumber(inputs.ambientTemperatureC)) {
		issues.push(issue('ambientTemperatureC', 'Ambient temperature must be a number.'));
	} else if (inputs.ambientTemperatureC <= ABSOLUTE_ZERO_C) {
		issues.push(issue('ambientTemperatureC', 'Ambient temperature must be above absolute zero.'));
	}

	if (
		isFiniteNumber(inputs.sourceTemperatureC) &&
		isFiniteNumber(inputs.ambientTemperatureC) &&
		inputs.sourceTemperatureC > ABSOLUTE_ZERO_C &&
		inputs.ambientTemperatureC > ABSOLUTE_ZERO_C &&
		inputs.sourceTemperatureC <= inputs.ambientTemperatureC
	) {
		issues.push(
			issue('sourceTemperatureC', 'Heat source temperature must be greater than ambient temperature.'),
		);
	}

	if (!validEmissivity(inputs.sourceEmissivity)) {
		issues.push(issue('sourceEmissivity', 'Source emissivity must be greater than 0 and at most 1.'));
	}

	if (!isFiniteNumber(inputs.backConvectionWm2K) || inputs.backConvectionWm2K <= 0) {
		issues.push(
			issue('backConvectionWm2K', 'Back-surface convection coefficient must be greater than zero.'),
		);
	}

	if (!isFiniteNumber(inputs.airFitIntercept) || inputs.airFitIntercept <= 0) {
		issues.push(issue('airFitIntercept', 'Air-fit intercept must be greater than zero.'));
	}

	if (!isFiniteNumber(inputs.airFitSlope) || inputs.airFitSlope < 0) {
		issues.push(issue('airFitSlope', 'Air-fit slope cannot be negative.'));
	}

	if (!isFiniteNumber(inputs.toleranceK) || inputs.toleranceK <= 0) {
		issues.push(issue('toleranceK', 'Convergence tolerance must be greater than zero.'));
	}

	if (!isFiniteNumber(inputs.maxIterations)) {
		issues.push(issue('maxIterations', 'Maximum iterations must be a number.'));
	} else if (!Number.isInteger(inputs.maxIterations) || inputs.maxIterations < 1) {
		issues.push(issue('maxIterations', 'Maximum iterations must be a whole number of at least 1.'));
	} else if (inputs.maxIterations > 100000) {
		issues.push(issue('maxIterations', 'Maximum iterations cannot exceed 100000.'));
	}

	if (
		!isFiniteNumber(inputs.relaxation) ||
		inputs.relaxation <= 0 ||
		inputs.relaxation > 1
	) {
		issues.push(issue('relaxation', 'Relaxation factor must be greater than 0 and at most 1.'));
	}

	if (!Array.isArray(inputs.layers) || inputs.layers.length === 0) {
		issues.push(issue('layers', 'Add at least one material layer.'));
	} else if (inputs.layers.length > MAX_LAYERS) {
		issues.push(issue('layers', `A network can contain at most ${MAX_LAYERS} layers.`));
	}

	if (
		!Array.isArray(inputs.interfaces) ||
		(inputs.interfaces.length !== inputs.layers.length && Array.isArray(inputs.layers))
	) {
		issues.push(issue('interfaces', 'Each material layer must have one incoming connection.'));
	}

	if (Array.isArray(inputs.layers)) {
		inputs.layers.forEach((layer, index) => {
			const prefix = `layers.${index}`;
			if (!layer || typeof layer !== 'object') {
				issues.push(issue(prefix, `Layer ${index + 1} is missing.`));
				return;
			}
			if (!isFiniteNumber(layer.thicknessM) || layer.thicknessM <= 0) {
				issues.push(issue(`${prefix}.thicknessM`, 'Layer thickness must be greater than zero.'));
			}
			if (!isFiniteNumber(layer.conductivityWmK) || layer.conductivityWmK <= 0) {
				issues.push(issue(`${prefix}.conductivityWmK`, 'Layer conductivity must be greater than zero.'));
			}
			if (!validEmissivity(layer.frontEmissivity)) {
				issues.push(issue(`${prefix}.frontEmissivity`, 'Front-surface emissivity must be between 0 and 1.'));
			}
			if (!validEmissivity(layer.backEmissivity)) {
				issues.push(issue(`${prefix}.backEmissivity`, 'Back-surface emissivity must be between 0 and 1.'));
			}
		});
	}

	if (Array.isArray(inputs.interfaces)) {
		inputs.interfaces.forEach((networkInterface, index) => {
			const prefix = `interfaces.${index}`;
			if (!networkInterface || typeof networkInterface !== 'object') {
				issues.push(issue(prefix, `Connection ${index + 1} is missing.`));
				return;
			}
			switch (networkInterface.type) {
				case 'air-gap':
					if (!isFiniteNumber(networkInterface.gapThicknessM) || networkInterface.gapThicknessM <= 0) {
						issues.push(issue(`${prefix}.gapThicknessM`, 'Air-gap thickness must be greater than zero.'));
					}
					break;
				case 'adhesive':
					if (
						!isFiniteNumber(networkInterface.adhesiveThicknessM) ||
						networkInterface.adhesiveThicknessM <= 0
					) {
						issues.push(
							issue(`${prefix}.adhesiveThicknessM`, 'Adhesive thickness must be greater than zero.'),
						);
					}
					if (
						!isFiniteNumber(networkInterface.adhesiveConductivityWmK) ||
						networkInterface.adhesiveConductivityWmK <= 0
					) {
						issues.push(
							issue(
								`${prefix}.adhesiveConductivityWmK`,
								'Adhesive conductivity must be greater than zero.',
							),
						);
					}
					break;
				case 'contact':
					if (
						!isFiniteNumber(networkInterface.contactResistanceM2KW) ||
						networkInterface.contactResistanceM2KW < 0
					) {
						issues.push(
							issue(
								`${prefix}.contactResistanceM2KW`,
								'Contact resistance must be zero or greater.',
							),
						);
					}
					break;
				case 'bonded':
					break;
				default:
					issues.push(issue(`${prefix}.type`, 'Choose a valid connection type.'));
			}
		});
	}

	return issues;
}

export function validateTransientInputs(
	inputs: NetworkInputs,
	settings: TransientSettings,
): ValidationIssue[] {
	const solverPaths = new Set(['toleranceK', 'maxIterations', 'relaxation']);
	const issues = validateNetworkInputs(inputs).filter(
		(entry) => !solverPaths.has(entry.path),
	);

	if (!isFiniteNumber(settings.timeStepS) || settings.timeStepS <= 0) {
		issues.push(issue('timeStepS', 'Time step must be greater than zero.'));
	}

	if (!isFiniteNumber(settings.finalTimeS) || settings.finalTimeS <= 0) {
		issues.push(issue('finalTimeS', 'Final time must be greater than zero.'));
	}

	if (!isFiniteNumber(settings.initialTemperatureC) || settings.initialTemperatureC <= ABSOLUTE_ZERO_C) {
		issues.push(issue('initialTemperatureC', 'Initial temperature must be above absolute zero.'));
	}

	if (
		isFiniteNumber(settings.timeStepS) &&
		settings.timeStepS > 0 &&
		isFiniteNumber(settings.finalTimeS) &&
		settings.finalTimeS > 0
	) {
		const outputStepCount = Math.floor(settings.finalTimeS / settings.timeStepS) + 2;
		if (outputStepCount > MAX_TRANSIENT_OUTPUT_STEPS) {
			issues.push(
				issue(
					'finalTimeS',
					`This time range produces more than ${MAX_TRANSIENT_OUTPUT_STEPS} output steps. Increase the time step or shorten the final time.`,
				),
			);
		}
	}

	if (Array.isArray(inputs.layers)) {
		inputs.layers.forEach((layer, index) => {
			const prefix = `layers.${index}`;
			if (!isFiniteNumber(layer.densityKgM3) || layer.densityKgM3 <= 0) {
				issues.push(issue(`${prefix}.densityKgM3`, 'Layer density must be greater than zero.'));
			}
			if (!isFiniteNumber(layer.specificHeatJkgK) || layer.specificHeatJkgK <= 0) {
				issues.push(
					issue(`${prefix}.specificHeatJkgK`, 'Layer specific heat must be greater than zero.'),
				);
			}
		});
	}

	return issues;
}

interface NetworkEvaluation {
	interfaceResistances: number[];
	interfaceDetails: Array<
		Omit<
			InterfaceResult,
			'index' | 'temperatureDropK' | 'upstreamTemperatureC' | 'downstreamTemperatureC'
		>
	>;
	layerResistances: number[];
	backResistance: number;
	backDetails: Omit<BackResult, 'temperatureDropK' | 'surfaceTemperatureC' | 'ambientTemperatureC'>;
	gapMeanTemperatures: number[];
}

function parallelResistance(first: number, second: number): number {
	return 1 / (1 / first + 1 / second);
}

function interfaceResistance(
	inputs: NetworkInputs,
	index: number,
	upstreamK: number,
	downstreamK: number,
): {
	resistance: number;
	detail: Omit<
		InterfaceResult,
		'index' | 'temperatureDropK' | 'upstreamTemperatureC' | 'downstreamTemperatureC'
	>;
} {
	const networkInterface = inputs.interfaces[index];

	if (networkInterface.type === 'bonded') {
		return { resistance: 0, detail: { type: 'bonded', resistance: 0 } };
	}

	if (networkInterface.type === 'adhesive') {
		const resistance =
			(networkInterface.adhesiveThicknessM as number) /
			(networkInterface.adhesiveConductivityWmK as number);
		return {
			resistance,
			detail: {
				type: 'adhesive',
				resistance,
				adhesiveThicknessM: networkInterface.adhesiveThicknessM,
				adhesiveConductivityWmK: networkInterface.adhesiveConductivityWmK,
			},
		};
	}

	if (networkInterface.type === 'contact') {
		const resistance = networkInterface.contactResistanceM2KW as number;
		return {
			resistance,
			detail: {
				type: 'contact',
				resistance,
				contactResistanceM2KW: resistance,
			},
		};
	}

	const gapThickness = networkInterface.gapThicknessM as number;
	const gapMeanK = (upstreamK + downstreamK) / 2;
	const conductivity = airConductivityK(gapMeanK, inputs.airFitIntercept, inputs.airFitSlope);

	if (!Number.isFinite(conductivity) || conductivity <= 0) {
		throw new ThermalNetworkError(
			'Air conductivity is not positive at a gap mean temperature. Adjust the air-fit constants or the network temperatures.',
		);
	}

	const upstreamEmissivity =
		index === 0 ? inputs.sourceEmissivity : inputs.layers[index - 1].backEmissivity;
	const downstreamEmissivity = inputs.layers[index].frontEmissivity;
	const gapEmissivity = effectiveGapEmissivity(upstreamEmissivity, downstreamEmissivity);
	const conductionResistance = gapThickness / conductivity;
	const radiationCoefficient =
		STEFAN_BOLTZMANN *
		gapEmissivity *
		(upstreamK * upstreamK + downstreamK * downstreamK) *
		(upstreamK + downstreamK);
	const radiationResistance =
		radiationCoefficient > 0 ? 1 / radiationCoefficient : Number.POSITIVE_INFINITY;
	const resistance = parallelResistance(conductionResistance, radiationResistance);

	return {
		resistance,
		detail: {
			type: 'air-gap',
			resistance,
			gapThicknessM: gapThickness,
			effectiveEmissivity: gapEmissivity,
			airConductivityWmK: conductivity,
			gapMeanTemperatureK: gapMeanK,
			conductionResistance,
			radiationResistance,
			radiationCoefficient,
		},
	};
}

function backResistance(
	inputs: NetworkInputs,
	lastSurfaceK: number,
): {
	resistance: number;
	detail: Omit<BackResult, 'temperatureDropK' | 'surfaceTemperatureC' | 'ambientTemperatureC'>;
} {
	const ambientK = inputs.ambientTemperatureC + KELVIN_OFFSET;
	const effectiveEmissivity = inputs.layers[inputs.layers.length - 1].backEmissivity;
	const convectionResistance = 1 / inputs.backConvectionWm2K;
	const radiationCoefficient =
		STEFAN_BOLTZMANN *
		effectiveEmissivity *
		(lastSurfaceK * lastSurfaceK + ambientK * ambientK) *
		(lastSurfaceK + ambientK);
	const radiationResistance =
		radiationCoefficient > 0 ? 1 / radiationCoefficient : Number.POSITIVE_INFINITY;
	const resistance = parallelResistance(convectionResistance, radiationResistance);

	return {
		resistance,
		detail: {
			resistance,
			convectionResistance,
			radiationResistance,
			radiationCoefficient,
			effectiveEmissivity,
		},
	};
}

function evaluateNetwork(
	inputs: NetworkInputs,
	junctionTemperaturesK: number[],
): NetworkEvaluation {
	const hotK = inputs.sourceTemperatureC + KELVIN_OFFSET;
	const layerCount = inputs.layers.length;
	const interfaceResistances: number[] = [];
	const interfaceDetails: NetworkEvaluation['interfaceDetails'] = [];
	const layerResistances: number[] = [];
	const gapMeanTemperatures: number[] = [];

	for (let index = 0; index < layerCount; index += 1) {
		const upstreamK = index === 0 ? hotK : junctionTemperaturesK[2 * index - 1];
		const downstreamK = junctionTemperaturesK[2 * index];
		const { resistance, detail } = interfaceResistance(
			inputs,
			index,
			upstreamK,
			downstreamK,
		);
		interfaceResistances.push(resistance);
		interfaceDetails.push(detail);
		if (detail.gapMeanTemperatureK !== undefined) {
			gapMeanTemperatures.push(detail.gapMeanTemperatureK);
		}
		layerResistances.push(
			inputs.layers[index].thicknessM / inputs.layers[index].conductivityWmK,
		);
	}

	const { resistance: backResistanceValue, detail: backDetails } = backResistance(
		inputs,
		junctionTemperaturesK[junctionTemperaturesK.length - 1],
	);

	return {
		interfaceResistances,
		interfaceDetails,
		layerResistances,
		backResistance: backResistanceValue,
		backDetails,
		gapMeanTemperatures,
	};
}

function buildSnapshot(
	inputs: NetworkInputs,
	junctionTemperaturesK: number[],
): NetworkSnapshot {
	const evaluation = evaluateNetwork(inputs, junctionTemperaturesK);

	const interfaceResults: InterfaceResult[] = evaluation.interfaceDetails.map(
		(networkInterfaceResult, index) => {
			const upstreamTemperatureC =
				index === 0
					? inputs.sourceTemperatureC
					: junctionTemperaturesK[2 * index - 1] - KELVIN_OFFSET;
			const downstreamTemperatureC = junctionTemperaturesK[2 * index] - KELVIN_OFFSET;
			return {
				...networkInterfaceResult,
				index,
				upstreamTemperatureC,
				downstreamTemperatureC,
				temperatureDropK: upstreamTemperatureC - downstreamTemperatureC,
			};
		},
	);

	const layerResults: LayerResult[] = inputs.layers.map((layer, index) => {
		const frontTemperatureC = junctionTemperaturesK[2 * index] - KELVIN_OFFSET;
		const backTemperatureC = junctionTemperaturesK[2 * index + 1] - KELVIN_OFFSET;
		return {
			index,
			id: layer.id,
			label: layer.label,
			thicknessM: layer.thicknessM,
			conductivityWmK: layer.conductivityWmK,
			frontEmissivity: layer.frontEmissivity,
			backEmissivity: layer.backEmissivity,
			resistance: evaluation.layerResistances[index],
			temperatureDropK: frontTemperatureC - backTemperatureC,
			frontTemperatureC,
			backTemperatureC,
			meanTemperatureC: (frontTemperatureC + backTemperatureC) / 2,
		};
	});

	const surfaceTemperatureC =
		junctionTemperaturesK[junctionTemperaturesK.length - 1] - KELVIN_OFFSET;
	const back: BackResult = {
		...evaluation.backDetails,
		temperatureDropK: surfaceTemperatureC - inputs.ambientTemperatureC,
		surfaceTemperatureC,
		ambientTemperatureC: inputs.ambientTemperatureC,
	};

	const totalResistance =
		evaluation.interfaceResistances.reduce((sum, value) => sum + value, 0) +
		evaluation.layerResistances.reduce((sum, value) => sum + value, 0) +
		evaluation.backResistance;

	const temperatureNodes: TemperatureNode[] = [
		{
			key: 'source',
			label: 'Node 1 · Heat source',
			shortLabel: 'Source',
			temperatureC: inputs.sourceTemperatureC,
			kind: 'source',
		},
	];

	layerResults.forEach((layer, index) => {
		temperatureNodes.push({
			key: `layer-${index}-front`,
			label: `Node ${index + 2} · ${layer.label}`,
			shortLabel: `L${index + 1} front`,
			temperatureC: layer.frontTemperatureC,
			kind: 'layer-front',
			layerIndex: index,
		});
		temperatureNodes.push({
			key: `layer-${index}-back`,
			label: `Node ${index + 2} · ${layer.label}`,
			shortLabel: `L${index + 1} back`,
			temperatureC: layer.backTemperatureC,
			kind: 'layer-back',
			layerIndex: index,
		});
	});

	temperatureNodes.push({
		key: 'ambient',
		label: `Node ${inputs.layers.length + 2} · Ambient`,
		shortLabel: 'Ambient',
		temperatureC: inputs.ambientTemperatureC,
		kind: 'ambient',
	});

	return {
		totalResistance,
		sourceTemperatureC: inputs.sourceTemperatureC,
		ambientTemperatureC: inputs.ambientTemperatureC,
		layers: layerResults,
		interfaces: interfaceResults,
		back,
		temperatureNodes,
		airFitOutOfRange: evaluation.gapMeanTemperatures.some(
			(temperatureK) => temperatureK < 300 || temperatureK > 900,
		),
	};
}

export function solveThermalNetwork(inputs: NetworkInputs): ThermalNetworkResult {
	const issues = validateNetworkInputs(inputs);
	if (issues.length > 0) {
		throw new ThermalNetworkError(issues.map((entry) => entry.message).join(' '));
	}

	const hotK = inputs.sourceTemperatureC + KELVIN_OFFSET;
	const ambientK = inputs.ambientTemperatureC + KELVIN_OFFSET;
	const layerCount = inputs.layers.length;
	const junctionCount = layerCount * 2;
	const totalSegmentCount = layerCount * 2 + 1;

	let junctionTemperatures = Array.from(
		{ length: junctionCount },
		(_, index) => hotK + ((ambientK - hotK) * (index + 1)) / totalSegmentCount,
	);

	let iteration = 0;
	let errorK = Number.POSITIVE_INFINITY;

	while (errorK > inputs.toleranceK && iteration < inputs.maxIterations) {
		const previousTemperatures = junctionTemperatures.slice();
		const evaluation = evaluateNetwork(inputs, previousTemperatures);
		const totalResistance =
			evaluation.interfaceResistances.reduce((sum, value) => sum + value, 0) +
			evaluation.layerResistances.reduce((sum, value) => sum + value, 0) +
			evaluation.backResistance;
		const heatFluxWm2 = (hotK - ambientK) / totalResistance;

		let currentK = hotK;
		const nextTemperatures = new Array<number>(junctionCount);
		for (let index = 0; index < layerCount; index += 1) {
			currentK -= heatFluxWm2 * evaluation.interfaceResistances[index];
			nextTemperatures[2 * index] = currentK;
			currentK -= heatFluxWm2 * evaluation.layerResistances[index];
			nextTemperatures[2 * index + 1] = currentK;
		}

		for (let index = 0; index < junctionCount; index += 1) {
			junctionTemperatures[index] =
				inputs.relaxation * nextTemperatures[index] +
				(1 - inputs.relaxation) * previousTemperatures[index];
		}

		errorK = junctionTemperatures.reduce(
			(maximum, value, index) => Math.max(maximum, Math.abs(value - previousTemperatures[index])),
			0,
		);
		iteration += 1;
	}

	const converged = Number.isFinite(errorK) && errorK <= inputs.toleranceK;
	const snapshot = buildSnapshot(inputs, junctionTemperatures);
	const heatFluxWm2 = (hotK - ambientK) / snapshot.totalResistance;

	return {
		...snapshot,
		iterations: iteration,
		converged,
		errorK,
		heatFluxWm2,
	};
}

function solveTridiagonal(
	lower: number[],
	diagonal: number[],
	upper: number[],
	rhs: number[],
): number[] {
	const nodeCount = diagonal.length;
	const modifiedUpper = new Array<number>(nodeCount).fill(0);
	const modifiedRhs = new Array<number>(nodeCount).fill(0);

	modifiedUpper[0] = upper[0] / diagonal[0];
	modifiedRhs[0] = rhs[0] / diagonal[0];

	for (let index = 1; index < nodeCount; index += 1) {
		const denominator = diagonal[index] - lower[index] * modifiedUpper[index - 1];
		modifiedUpper[index] = index < nodeCount - 1 ? upper[index] / denominator : 0;
		modifiedRhs[index] =
			(rhs[index] - lower[index] * modifiedRhs[index - 1]) / denominator;
	}

	const solution = new Array<number>(nodeCount).fill(0);
	solution[nodeCount - 1] = modifiedRhs[nodeCount - 1];
	for (let index = nodeCount - 2; index >= 0; index -= 1) {
		solution[index] =
			modifiedRhs[index] - modifiedUpper[index] * solution[index + 1];
	}
	return solution;
}

function buildTransientStep(
	inputs: NetworkInputs,
	timeS: number,
	nodeTemperaturesK: number[],
): TransientStepResult {
	const evaluation = evaluateNetwork(inputs, nodeTemperaturesK);
	const sourceK = inputs.sourceTemperatureC + KELVIN_OFFSET;
	const ambientK = inputs.ambientTemperatureC + KELVIN_OFFSET;
	const layerMeans = inputs.layers.map(
		(_layer, index) =>
			(nodeTemperaturesK[2 * index] +
				nodeTemperaturesK[2 * index + 1]) /
				2 -
			KELVIN_OFFSET,
	);
	const firstResistance = evaluation.interfaceResistances[0];
	const sourceHeatFluxWm2 =
		firstResistance > 0
			? (sourceK - nodeTemperaturesK[0]) / firstResistance
			: null;
	const ambientHeatFluxWm2 =
		(nodeTemperaturesK[nodeTemperaturesK.length - 1] - ambientK) /
		evaluation.backResistance;

	return {
		timeS,
		nodeTemperaturesC: nodeTemperaturesK.map((value) => value - KELVIN_OFFSET),
		layerMeanTemperaturesC: layerMeans,
		sourceHeatFluxWm2,
		ambientHeatFluxWm2,
	};
}

export function solveTransientNetwork(
	inputs: NetworkInputs,
	settings: TransientSettings,
): TransientNetworkResult {
	const issues = validateTransientInputs(inputs, settings);
	if (issues.length > 0) {
		throw new ThermalNetworkError(issues.map((entry) => entry.message).join(' '));
	}

	const sourceK = inputs.sourceTemperatureC + KELVIN_OFFSET;
	const ambientK = inputs.ambientTemperatureC + KELVIN_OFFSET;
	const initialK = settings.initialTemperatureC + KELVIN_OFFSET;
	const nodeCount = inputs.layers.length * 2;
	const capacities: number[] = [];

	for (const layer of inputs.layers) {
		const halfCapacity =
			(layer.densityKgM3 * layer.specificHeatJkgK * layer.thicknessM) / 2;
		capacities.push(halfCapacity, halfCapacity);
	}

	const times = [0];
	let currentTime = 0;
	while (currentTime < settings.finalTimeS - 1e-12) {
		currentTime = Math.min(currentTime + settings.timeStepS, settings.finalTimeS);
		times.push(currentTime);
	}

	let nodeTemperaturesK = new Array<number>(nodeCount).fill(initialK);
	const steps: TransientStepResult[] = [
		buildTransientStep(inputs, 0, nodeTemperaturesK),
	];

	for (let stepIndex = 1; stepIndex < times.length; stepIndex += 1) {
		const stepS = times[stepIndex] - times[stepIndex - 1];
		const evaluation = evaluateNetwork(inputs, nodeTemperaturesK);
		const conductances: number[] = [];

		for (let index = 0; index < inputs.layers.length; index += 1) {
			const interfaceResistanceValue = evaluation.interfaceResistances[index];
			conductances.push(
				interfaceResistanceValue > 0 && Number.isFinite(interfaceResistanceValue)
					? 1 / interfaceResistanceValue
					: MAX_CONDUCTANCE,
			);
			conductances.push(1 / evaluation.layerResistances[index]);
		}
		conductances.push(1 / evaluation.backResistance);

		const lower = new Array<number>(nodeCount).fill(0);
		const diagonal = new Array<number>(nodeCount).fill(0);
		const upper = new Array<number>(nodeCount).fill(0);
		const rhs = new Array<number>(nodeCount).fill(0);

		for (let index = 0; index < nodeCount; index += 1) {
			const leftConductance = conductances[index];
			const rightConductance = conductances[index + 1];
			const capacitanceTerm = capacities[index] / stepS;
			diagonal[index] =
				capacitanceTerm + leftConductance + rightConductance;
			rhs[index] = capacitanceTerm * nodeTemperaturesK[index];
			if (index > 0) {
				lower[index] = -leftConductance;
			} else {
				rhs[index] += leftConductance * sourceK;
			}
			if (index < nodeCount - 1) {
				upper[index] = -rightConductance;
			} else {
				rhs[index] += rightConductance * ambientK;
			}
		}

		nodeTemperaturesK = solveTridiagonal(lower, diagonal, upper, rhs);
		steps.push(buildTransientStep(inputs, times[stepIndex], nodeTemperaturesK));
	}

	return {
		settings: { ...settings },
		steps,
		final: buildSnapshot(inputs, nodeTemperaturesK),
	};
}
