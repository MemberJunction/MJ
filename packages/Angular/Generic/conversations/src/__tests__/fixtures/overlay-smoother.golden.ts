/**
 * Golden frames from `RealtimeAudioVisualSmoother`, captured before it moved onto the shared smoothing in
 * `@memberjunction/ai-realtime-client/media`. The smoother must keep producing them.
 */
import type { RealtimeAudioActivity } from '@memberjunction/ai-realtime-client';
import type { RealtimeDirection } from '../../lib/components/realtime/realtime-audio-visuals';

export interface OverlayGoldenStep {
  /** `null` stands for a driver with no meters. */
  In: RealtimeAudioActivity | null;
  NowMs: number;
  Out: { OutputLevel: number; InputLevel: number; Bins: number[]; Direction: RealtimeDirection } | null;
}

export const OVERLAY_SMOOTHER_GOLDEN: readonly OverlayGoldenStep[] = [
  { In: null, NowMs: 0, Out: null },
  { In: { InputLevel: 0.02, OutputLevel: 0, InputBins: [0.770846548, 0.727437941, 0.341903904, 0.204432882, 0.654621689, 0.796931687, 0.56443226, 0.066471522, 0.462751812], OutputBins: [0.412401097, 0.126196555, 0.605441996, 0.799938606, 0.61821159, 0.145730003, 0.395290681, 0.750399981, 0.752584445] }, NowMs: 100, Out: { OutputLevel: 0, InputLevel: 0, Bins: [0, 0, 0, 0, 0, 0, 0, 0, 0], Direction: 'none' } },
  { In: { InputLevel: 0.4, OutputLevel: 0.01, InputBins: [0.550212927, 0.794952803, 0.665813954, 0.223532399, 0.323879936, 0.718966477, 0.775911849, 0.467933754, 0.060120896], OutputBins: [0.706763725, 0.299101332, 0.249233091, 0.680349297, 0.791486597, 0.530375384, 0.01982034, 0.500056519, 0.784748984] }, NowMs: 200, Out: { OutputLevel: 0, InputLevel: 0.185863874, Bins: [0.275106464, 0.397476402, 0.332906977, 0.1117662, 0.161939968, 0.359483239, 0.387955925, 0.233966877, 0.030060448], Direction: 'user' } },
  { In: { InputLevel: 0.5, OutputLevel: 0.02, InputBins: [0.17209599, 0.634934291, 0.799153073, 0.587517678, 0.099563539, 0.435216889, 0.765308013, 0.735462821, 0.359717972], OutputBins: null }, NowMs: 300, Out: { OutputLevel: 0, InputLevel: 0.331151832, Bins: [0.262745207, 0.516205346, 0.566030025, 0.349641939, 0.154454797, 0.397350064, 0.576631969, 0.484714849, 0.19488921], Direction: 'user' } },
  { In: { InputLevel: 0.03, OutputLevel: 0, InputBins: [0.798834676, 0.63878969, 0.178311931, 0.366028715, 0.738220337, 0.7632154, 0.429258334, 0.106585633, 0.592300712], OutputBins: [0.25527869, 0.293183303, 0.703756608, 0.783342183, 0.49450969, 0.026898438, 0.53565581, 0.792485885, 0.676597465] }, NowMs: 400, Out: { OutputLevel: 0, InputLevel: 0.291413613, Bins: [0.231215782, 0.454260705, 0.498106422, 0.307684906, 0.135920221, 0.349668056, 0.507436132, 0.426549067, 0.171502505], Direction: 'user' } },
  { In: { InputLevel: 0.01, OutputLevel: 0.6, InputBins: null, OutputBins: [0.662261175, 0.795642071, 0.554820068, 0.053057518, 0.473658812, 0.777606001, 0.715832938, 0.317392459, 0.230322653] }, NowMs: 500, Out: { OutputLevel: 0.293814433, InputLevel: 0.256443979, Bins: [0.446738478, 0.624951388, 0.526463245, 0.27712962, 0.304789516, 0.563637029, 0.611634535, 0.413450274, 0.200912579], Direction: 'user' } },
  { In: { InputLevel: 0.2, OutputLevel: 0.7, InputBins: [0.609586867, 0.13248334, 0.406929171, 0.754956536, 0.747916044, 0.389118951, 0.152686865, 0.622681663, 0.799819545], OutputBins: [0.336133629, 0.724763794, 0.772526221, 0.456957496, 0.07352548, 0.569428274, 0.797520053, 0.650525689, 0.197578929] }, NowMs: 600, Out: { OutputLevel: 0.492268041, InputLevel: 0.245147141, Bins: [0.433465897, 0.674857591, 0.649494733, 0.367043558, 0.277037832, 0.566532651, 0.704577294, 0.531987982, 0.200512541], Direction: 'agent' } },
  { In: { InputLevel: 0.9, OutputLevel: 0.3, InputBins: [0.789417571, 0.520230272, 0.006370547, 0.510485346, 0.787252004, 0.693761744, 0.273984495, 0.274651943, 0.694115281], OutputBins: [0.086202922, 0.446441817, 0.769117994, 0.73006596, 0.347652498, 0.198267366, 0.65093899, 0.797463835, 0.568928978] }, NowMs: 700, Out: { OutputLevel: 0.466597938, InputLevel: 0.57021755, Bins: [0.611441734, 0.656302313, 0.572319831, 0.438764452, 0.532144918, 0.630147198, 0.652906158, 0.501107657, 0.447313911], Direction: 'user' } },
  { In: { InputLevel: 0, OutputLevel: 0, InputBins: null, OutputBins: null }, NowMs: 800, Out: { OutputLevel: 0.410606186, InputLevel: 0.501791444, Bins: [0.538068726, 0.577546035, 0.503641451, 0.386112718, 0.468287528, 0.554529534, 0.574557419, 0.440974738, 0.393636242], Direction: 'user' } },
  { In: { InputLevel: 0, OutputLevel: 0, InputBins: null, OutputBins: null }, NowMs: 900, Out: { OutputLevel: 0.361333443, InputLevel: 0.441576471, Bins: [0.473500479, 0.508240511, 0.443204477, 0.339779192, 0.412093025, 0.48798599, 0.505610529, 0.38805777, 0.346399893], Direction: 'user' } },
  { In: { InputLevel: 0, OutputLevel: 0, InputBins: null, OutputBins: null }, NowMs: 1000, Out: { OutputLevel: 0.31797343, InputLevel: 0.388587294, Bins: [0.416680421, 0.44725165, 0.39001994, 0.299005689, 0.362641862, 0.429427671, 0.444937265, 0.341490837, 0.304831906], Direction: 'user' } },
];
