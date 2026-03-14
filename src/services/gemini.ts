import { GoogleGenAI, Type, Modality } from "@google/genai";

const getAi = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateStoryStart(theme: string) {
  const ai = getAi();
  const prompt = `Start a whimsical, magical story for a child about ${theme}. 
  Provide a catchy, magical title for the story, the first paragraph of the story (2-3 sentences), 2 options for what happens next, a detailed visual prompt for an illustration of this scene, a characterDescription (a highly detailed visual description of the main character to ensure consistency in future illustrations), and a moodColor (hex code) representing the scene's vibe.`;
  
  return callStoryModel(ai, prompt);
}

export async function generateNextSegment(previousStory: string, choice: string) {
  const ai = getAi();
  const prompt = `The story so far: ${previousStory}
  The child chose: ${choice}
  
  Continue the whimsical, magical story for a child. 
  Make the story highly dynamic: the child's choice should significantly alter the environment, introduce new unexpected magical elements, or change the characters' paths in surprising ways.
  Provide the next paragraph of the story (2-3 sentences), 2 options for what happens next, a detailed visual prompt for an illustration of this new scene, and a moodColor (hex code) representing the new scene's vibe.`;
  
  return callStoryModel(ai, prompt);
}

async function callStoryModel(ai: GoogleGenAI, prompt: string) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "A catchy, magical title for the story (only required for the start of the story)" },
          story: { type: Type.STRING, description: "The story paragraph (2-3 sentences max)" },
          options: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "2 short options for what the child can choose to happen next"
          },
          imagePrompt: { type: Type.STRING, description: "A detailed prompt to generate an illustration for this scene. Make it magical, colorful, and suitable for children." },
          characterDescription: { type: Type.STRING, description: "A highly detailed visual description of the main character(s) (e.g., 'A small orange fox with a white-tipped tail wearing a tiny blue scarf'). This will be used to keep illustrations consistent." },
          moodColor: { type: Type.STRING, description: "A hex color code representing the mood of this story segment (e.g., #1e3a8a for mysterious, #f59e0b for happy)" }
        },
        required: ["story", "options", "imagePrompt", "moodColor"]
      }
    }
  });
  
  return JSON.parse(response.text || "{}");
}

export async function generateIllustration(prompt: string, characterDescription?: string) {
  const ai = getAi();
  const isGif = Math.random() < 0.5;
  const stylePrefix = isGif 
    ? "A magical, whimsical children's book illustration, colorful, enchanting, high quality, in the style of an animated GIF or pixel art GIF. " 
    : "A magical, whimsical children's book illustration, colorful, enchanting, high quality. ";

  const finalPrompt = characterDescription 
    ? `${stylePrefix} Main Character: ${characterDescription}. Scene: ${prompt}`
    : `${stylePrefix}${prompt}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [{ text: finalPrompt }],
    },
  });
  
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }
  throw new Error("Failed to generate image");
}

export async function generateNarration(text: string) {
  const ai = getAi();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Read this in an old, kind, magical storyteller voice with dramatic flare: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Fenrir' },
        },
      },
    },
  });
  
  const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (inlineData) {
    return inlineData;
  }
  throw new Error("Failed to generate audio");
}

export async function generateStoryEnding(story: string) {
  const ai = getAi();
  const prompt = `You are a magical storyteller in the style of the Brothers Grimm.
  The story so far: "${story}"
  
  The user has chosen to end the story. Provide a final, concluding sentence or short paragraph to wrap up the tale beautifully and magically in a classic fairy tale style.
  Return a JSON object with:
  - "ending": The final sentence/paragraph.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          ending: { type: Type.STRING }
        },
        required: ["ending"]
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("No text returned");
  const result = JSON.parse(text);
  return result.ending;
}

export async function processVoiceInput(audioBlob: Blob, options: string[]) {
  if (audioBlob.size === 0) {
    throw new Error("Empty audio blob");
  }
  
  const ai = getAi();
  const base64Audio = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.readAsDataURL(audioBlob);
  });

  const prompt = `The child is listening to a story and was given these options:
  ${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}
  
  Listen to the child's voice input. Did they choose one of the options, or suggest something else?
  Return a JSON object with:
  - "choice": The text of the option they chose, or their custom suggestion if they said something else.
  - "matchedOptionIndex": The index (0 or 1) of the option if it matches, or null if it's a custom suggestion.`;

  const mimeType = audioBlob.type.split(';')[0] || 'audio/webm';
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        {
          inlineData: {
            data: base64Audio,
            mimeType: mimeType,
          }
        },
        {
          text: prompt
        }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          choice: { type: Type.STRING },
          matchedOptionIndex: { type: Type.NUMBER }
        },
        required: ["choice"]
      }
    }
  });
  
  return JSON.parse(response.text || "{}");
}
