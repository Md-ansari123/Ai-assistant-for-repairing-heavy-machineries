import { GoogleGenAI, Type, Chat } from "@google/genai";
import { RepairGuideResponse, RepairStep } from '../types';

// Helper function to convert File to a base64 string
const fileToGenerativePart = async (file: File) => {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result.split(',')[1]);
      } else {
        resolve('');
      }
    };
    reader.readAsDataURL(file);
  });
  return {
    inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
  };
};

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

const boundingBoxSchema = {
  type: Type.OBJECT,
  description: "A normalized bounding box (coordinates from 0.0 to 1.0) for the part relevant to this step. Only include this if an image was provided.",
  properties: {
    x: { type: Type.NUMBER, description: "Top-left corner X coordinate." },
    y: { type: Type.NUMBER, description: "Top-left corner Y coordinate." },
    width: { type: Type.NUMBER, description: "Width of the box." },
    height: { type: Type.NUMBER, description: "Height of the box." },
  },
  required: ['x', 'y', 'width', 'height'],
};

const repairStepSchema = {
    type: Type.OBJECT,
    properties: {
        description: {
            type: Type.STRING,
            description: "A detailed description of this single repair step.",
        },
        boundingBox: boundingBoxSchema,
    },
    required: ['description'],
};

const repairGuideSchema = {
  type: Type.OBJECT,
  properties: {
    diagnosis: {
      type: Type.STRING,
      description: "A concise diagnosis of the problem.",
    },
    estimatedCost: {
      type: Type.STRING,
      description: "An estimated cost for the repair, including parts and labor. Provide a range if necessary.",
    },
    machineDowntime: {
      type: Type.STRING,
      description: "The total estimated time the machine will be non-operational or 'down'. This includes active repair time, waiting for parts, cooling, or curing times. (e.g., '24 hours', '2-3 days').",
    },
    manualLaborTime: {
        type: Type.STRING,
        description: "The estimated hands-on time a technician will spend actively working on the repair. (e.g., '4-5 hours').",
    },
    partAvailability: {
      type: Type.STRING,
      description: "Information on the availability of required parts (e.g., 'Commonly available', 'May need to be ordered').",
    },
    requiredTools: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "A list of tools required for the repair.",
    },
    requiredMaterials: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "A list of consumable materials or components required for the repair (e.g., Cotton tape, Mica tape, insulation papers, grease, sealant, contactors, timers, winder panels).",
    },
    safetyWarnings: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "A list of critical safety warnings and precautions.",
    },
    repairSteps: {
      type: Type.ARRAY,
      items: repairStepSchema,
      description: "A detailed, step-by-step guide to performing the repair.",
    },
    preventativeMaintenance: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "A list of preventative maintenance tips to avoid similar breakdowns in the future."
    },
  },
  required: ['diagnosis', 'estimatedCost', 'machineDowntime', 'manualLaborTime', 'partAvailability', 'requiredTools', 'requiredMaterials', 'safetyWarnings', 'repairSteps', 'preventativeMaintenance'],
};

export const generateRepairGuide = async (problemDescription: string, mediaFile: File | null): Promise<RepairGuideResponse> => {
  const model = 'gemini-2.5-pro';

  const systemInstruction = `You are an expert AI mechanic specializing in heavy machinery for the Jharkhand Mining Division. 
  Your task is to provide a detailed and accurate repair guide based on the user's description and optional photo or video.
  You MUST provide two separate time estimates:
  1. 'machineDowntime': The total time the equipment will be out of service. This includes active repair, diagnostics, waiting for parts to arrive, cooling periods, paint curing, etc.
  2. 'manualLaborTime': The actual hands-on time a technician is expected to work on the machine.
  CRITICAL RULE: The 'manualLaborTime' MUST ALWAYS be less than or equal to the 'machineDowntime'. The total time the machine is unavailable cannot be less than the time a technician is actively working on it. Double-check your generated values to ensure this logical rule is followed without exception.
  You MUST also provide a list of preventative maintenance steps to help technicians avoid similar breakdowns in the future.
  The user is a technician, so be clear, concise, and professional.
  Strictly do not ask for, process, or store any personally identifiable information (PII) such as names, phone numbers, email addresses, or specific locations. All interactions must be anonymous.
  Always prioritize safety. If the repair is too complex or dangerous, advise seeking specialized help.
  When listing required materials or components, be specific to the machinery type. For example:
- For motors and transformers, list materials like cotton tape, Mica tape, insulation papers, grease, and sealant.
- For control panels, switches, or winder panels, you might list components like replacement contactors, overload relays, or timers if they are faulty.
Do not suggest control panel components like contactors or timers for a motor or transformer repair unless the problem description explicitly involves its control circuitry.
  If the user provides an image, for each repair step, you MUST provide a 'boundingBox' object that precisely highlights the relevant component in the image. The coordinates must be normalized (from 0.0 to 1.0). If no image is provided, or for steps that don't refer to a specific visual part (like a final check), you MUST omit the 'boundingBox'.
  Generate a response in JSON format according to the provided schema.`;

  const textPart = { text: `Problem: ${problemDescription}` };
  const contents: any[] = [textPart];

  if (mediaFile) {
    const mediaPart = await fileToGenerativePart(mediaFile);
    contents.unshift(mediaPart);
  }
  
  const response = await ai.models.generateContent({
    model: model,
    contents: { parts: contents },
    config: {
      systemInstruction: systemInstruction,
      responseMimeType: "application/json",
      responseSchema: repairGuideSchema,
      temperature: 0.2,
      thinkingConfig: { thinkingBudget: 32768 },
    }
  });

  const jsonText = response.text.trim();
  try {
    return JSON.parse(jsonText) as RepairGuideResponse;
  } catch (e) {
    console.error("Failed to parse JSON response:", jsonText);
    throw new Error("The AI returned an invalid response format. Please try again.");
  }
};

export const createChatSession = (initialContext: string): Chat => {
  return ai.chats.create({
    model: 'gemini-2.5-flash',
    config: {
      systemInstruction: `You are an AI chat assistant helping a technician with a heavy machinery repair. 
      The initial problem was: "${initialContext}". 
      Answer follow-up questions concisely and helpfully.
      Keep the context of the original repair problem in mind.
      IMPORTANT: You must not ask for any personally identifiable information (PII) like names, contact numbers, or email addresses. Politely decline if a user offers such information and remind them not to share personal details.`,
    },
  });
};

export const sendChatMessage = async (chat: Chat, message: string): Promise<string> => {
  const response = await chat.sendMessage({ message });
  return response.text;
};

const translationArraySchema = {
    type: Type.OBJECT,
    properties: {
        translations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "An array of translated strings, in the same order as the input.",
        }
    },
    required: ['translations'],
};

export const translateRepairGuide = async (guide: RepairGuideResponse, targetLanguage: string): Promise<RepairGuideResponse> => {
    const model = 'gemini-2.5-flash';

    const stringsToTranslate: string[] = [
        guide.diagnosis,
        guide.estimatedCost,
        guide.machineDowntime,
        guide.manualLaborTime,
        guide.partAvailability,
        ...guide.requiredTools,
        ...(guide.requiredMaterials || []),
        ...guide.safetyWarnings,
        ...guide.repairSteps.map(step => step.description),
        ...(guide.preventativeMaintenance || []),
    ];

    const prompt = `You are an expert multilingual translator specializing in technical and mechanical terms.
    Translate the following array of strings into ${targetLanguage}.
    Return the translated strings in a JSON object with a single key "translations" which is an array of strings.
    The order of the translated strings in the output array MUST EXACTLY match the order of the strings in the input array.
    Do not alter technical terms that do not have a direct equivalent.

    Input strings to translate:
    ${JSON.stringify(stringsToTranslate, null, 2)}
    `;

    const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
            temperature: 0.1,
            responseMimeType: "application/json",
            responseSchema: translationArraySchema,
        }
    });

    try {
        const jsonResponse = JSON.parse(response.text.trim());
        const translatedStrings = jsonResponse.translations as string[];

        if (translatedStrings.length !== stringsToTranslate.length) {
            throw new Error("Translation returned a different number of strings than expected.");
        }

        let currentIndex = 0;
        
        const diagnosis = translatedStrings[currentIndex++];
        const estimatedCost = translatedStrings[currentIndex++];
        const machineDowntime = translatedStrings[currentIndex++];
        const manualLaborTime = translatedStrings[currentIndex++];
        const partAvailability = translatedStrings[currentIndex++];

        const requiredTools = translatedStrings.slice(currentIndex, currentIndex + guide.requiredTools.length);
        currentIndex += guide.requiredTools.length;
        
        const requiredMaterials = guide.requiredMaterials ? translatedStrings.slice(currentIndex, currentIndex + guide.requiredMaterials.length) : [];
        if(guide.requiredMaterials) currentIndex += guide.requiredMaterials.length;

        const safetyWarnings = translatedStrings.slice(currentIndex, currentIndex + guide.safetyWarnings.length);
        currentIndex += guide.safetyWarnings.length;

        const translatedRepairSteps: RepairStep[] = guide.repairSteps.map((originalStep, index) => ({
            ...originalStep,
            description: translatedStrings[currentIndex + index],
        }));
        currentIndex += guide.repairSteps.length;

        const preventativeMaintenance = guide.preventativeMaintenance ? translatedStrings.slice(currentIndex, currentIndex + guide.preventativeMaintenance.length) : [];
        if(guide.preventativeMaintenance) currentIndex += guide.preventativeMaintenance.length;
        
        return {
            diagnosis,
            estimatedCost,
            machineDowntime,
            manualLaborTime,
            partAvailability,
            requiredTools,
            requiredMaterials,
            safetyWarnings,
            repairSteps: translatedRepairSteps,
            preventativeMaintenance,
        };

    } catch (e: any) {
        console.error("Failed to parse or process translated JSON response:", response.text, e);
        throw new Error("The AI returned an invalid translation format.");
    }
};