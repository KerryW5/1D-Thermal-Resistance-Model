export const STEFAN_BOLTZMANN = 5.67e-8;
export const KELVIN_OFFSET = 273.15;
export const ABSOLUTE_ZERO_C = -273.15;
export const MAX_LAYERS = 20;

export type InterfaceType = 'air-gap' | 'bonded' | 'adhesive' | 'contact';
export type NodeKind = 'source' | 'layer-front' | 'layer-back' | 'ambient';

export interface LayerInput {
	id: string;
	label: string;
	thicknessM: number;
	conductivityWmK: number;
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

export interface ThermalNetworkResult {
	iterations: number;
	converged: boolean;
	errorK: number;
	heatFluxWm2: number;
	totalResistance: number;
	sourceTemperatureC: number;
	ambientTemperatureC: number;
	layers: LayerResult[];
	interfaces: InterfaceResult[];
	back: BackResult;
	temperatureNodes: TemperatureNode[];
	airFitOutOfRange: boolean;
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

interface IterationState {
	interfaceResistances: number[];
	layerResistances: number[];
	backResistance: number;
	interfaceDetails: InterfaceResult[];
	backDetails: Omit<BackResult, 'temperatureDropK' | 'surfaceTemperatureC' | 'ambientTemperatureC'>;
	heatFluxWm2: number;
	totalResistance: number;
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
): { resistance: number; detail: Omit<InterfaceResult, 'index' | 'temperatureDropK' | 'upstreamTemperatureC' | 'downstreamTemperatureC'> } {
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
): { resistance: number; detail: IterationState['backDetails'] } {
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
	let lastState: IterationState | null = null;

	while (errorK > inputs.toleranceK && iteration < inputs.maxIterations) {
		const previousTemperatures = junctionTemperatures.slice();
		const interfaceResistances: number[] = [];
		const layerResistances: number[] = [];
		const interfaceDetails: InterfaceResult[] = [];
		const gapMeanTemperatures: number[] = [];

		for (let index = 0; index < layerCount; index += 1) {
			const upstreamK = index === 0 ? hotK : previousTemperatures[2 * index - 1];
			const downstreamK = previousTemperatures[2 * index];
			const { resistance, detail } = interfaceResistance(
				inputs,
				index,
				upstreamK,
				downstreamK,
			);
			interfaceResistances.push(resistance);
			interfaceDetails.push({
				...detail,
				index,
				temperatureDropK: 0,
				upstreamTemperatureC: upstreamK - KELVIN_OFFSET,
				downstreamTemperatureC: downstreamK - KELVIN_OFFSET,
			});
			if (detail.gapMeanTemperatureK !== undefined) {
				gapMeanTemperatures.push(detail.gapMeanTemperatureK);
			}

			layerResistances.push(
				inputs.layers[index].thicknessM / inputs.layers[index].conductivityWmK,
			);
		}

		const lastSurfaceK = previousTemperatures[junctionCount - 1];
		const { resistance: backResistanceValue, detail: backDetails } = backResistance(
			inputs,
			lastSurfaceK,
		);

		const totalResistance =
			interfaceResistances.reduce((sum, value) => sum + value, 0) +
			layerResistances.reduce((sum, value) => sum + value, 0) +
			backResistanceValue;
		const heatFluxWm2 = (hotK - ambientK) / totalResistance;

		let currentK = hotK;
		const nextTemperatures = new Array<number>(junctionCount);
		for (let index = 0; index < layerCount; index += 1) {
			currentK -= heatFluxWm2 * interfaceResistances[index];
			nextTemperatures[2 * index] = currentK;
			currentK -= heatFluxWm2 * layerResistances[index];
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

		lastState = {
			interfaceResistances,
			layerResistances,
			backResistance: backResistanceValue,
			interfaceDetails,
			backDetails,
			heatFluxWm2,
			totalResistance,
			gapMeanTemperatures,
		};
	}

	if (!lastState) {
		throw new ThermalNetworkError('The solver did not produce a result.');
	}

	const converged = Number.isFinite(errorK) && errorK <= inputs.toleranceK;
	const layerResults: LayerResult[] = inputs.layers.map((layer, index) => {
		const frontTemperatureC = junctionTemperatures[2 * index] - KELVIN_OFFSET;
		const backTemperatureC = junctionTemperatures[2 * index + 1] - KELVIN_OFFSET;
		return {
			index,
			id: layer.id,
			label: layer.label,
			thicknessM: layer.thicknessM,
			conductivityWmK: layer.conductivityWmK,
			frontEmissivity: layer.frontEmissivity,
			backEmissivity: layer.backEmissivity,
			resistance: lastState.layerResistances[index],
			temperatureDropK: lastState.heatFluxWm2 * lastState.layerResistances[index],
			frontTemperatureC,
			backTemperatureC,
			meanTemperatureC: (frontTemperatureC + backTemperatureC) / 2,
		};
	});

	const interfaceResults: InterfaceResult[] = lastState.interfaceDetails.map(
		(networkInterfaceResult, index) => ({
			...networkInterfaceResult,
			temperatureDropK: lastState.heatFluxWm2 * networkInterfaceResult.resistance,
			upstreamTemperatureC:
				index === 0
					? inputs.sourceTemperatureC
					: junctionTemperatures[2 * index - 1] - KELVIN_OFFSET,
			downstreamTemperatureC: junctionTemperatures[2 * index] - KELVIN_OFFSET,
		}),
	);

	const back: BackResult = {
		...lastState.backDetails,
		temperatureDropK: lastState.heatFluxWm2 * lastState.backResistance,
		surfaceTemperatureC: junctionTemperatures[junctionCount - 1] - KELVIN_OFFSET,
		ambientTemperatureC: inputs.ambientTemperatureC,
	};

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
		label: `Node ${layerCount + 2} · Ambient`,
		shortLabel: 'Ambient',
		temperatureC: inputs.ambientTemperatureC,
		kind: 'ambient',
	});

	const airFitOutOfRange = lastState.gapMeanTemperatures.some(
		(temperatureK) => temperatureK < 300 || temperatureK > 900,
	);

	return {
		iterations: iteration,
		converged,
		errorK,
		heatFluxWm2: lastState.heatFluxWm2,
		totalResistance: lastState.totalResistance,
		sourceTemperatureC: inputs.sourceTemperatureC,
		ambientTemperatureC: inputs.ambientTemperatureC,
		layers: layerResults,
		interfaces: interfaceResults,
		back,
		temperatureNodes,
		airFitOutOfRange,
	};
}
