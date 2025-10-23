import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";

// --- TYPES & CONSTANTS ---
interface LibraryEntry {
    id: string;
    title: string;
    sourceText: string;
    infographicHtml: string;
    analysisLens: string;
    customDirectives: string;
    visualTheme: VisualTheme;
    createdAt: string;
    refinementHistory: string[];
}

type VisualTheme = 'Modern Scholar' | 'Manuscript';
type View = 'welcome' | 'infographic';
type AnalysisLens = 'General Summary' | 'Halachic Structure & Process' | 'Philosophical Deep Dive' | 'Character & Narrative Analysis' | 'Compare & Contrast Viewpoints';

const ANALYSIS_LENSES: AnalysisLens[] = [
    'General Summary',
    'Halachic Structure & Process',
    'Philosophical Deep Dive',
    'Character & Narrative Analysis',
    'Compare & Contrast Viewpoints'
];

const QUOTES = [
    "Turn it, and turn it, for everything is in it. (Ben Bag Bag, Pirkei Avot 5:22)",
    "The world stands on three things: on Torah, on service, and on acts of loving-kindness. (Shimon Hatzadik, Pirkei Avot 1:2)",
    "The day is short, the work is great... It is not your duty to finish the work, but neither are you at liberty to neglect it. (Rabbi Tarfon, Pirkei Avot 2:15-16)",
    "Who is wise? He who learns from every man. (Ben Zoma, Pirkei Avot 4:1)"
];

const API_KEY = process.env.API_KEY;
const ai = new GoogleGenAI({ apiKey: API_KEY });
const model = ai.models;

// --- HELPER FUNCTIONS ---
const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result as string;
            // remove the header from the base64 string e.g. data:audio/mpeg;base64,
            resolve(result.split(',')[1]);
        };
        reader.onerror = (error) => reject(error);
    });
};

// --- MAIN APP COMPONENT ---
const App: React.FC = () => {
    // Core State
    const [view, setView] = useState<View>('welcome');
    const [isLoading, setIsLoading] = useState(false);
    const [loadingQuote, setLoadingQuote] = useState('');
    const [currentAnalysis, setCurrentAnalysis] = useState<LibraryEntry | null>(null);

    // Form State
    const [sourceText, setSourceText] = useState('');
    const [analysisLens, setAnalysisLens] = useState<AnalysisLens>('General Summary');
    const [customDirectives, setCustomDirectives] = useState('');
    const [visualTheme, setVisualTheme] = useState<VisualTheme>('Modern Scholar');

    // Library & Modals
    const [library, setLibrary] = useState<LibraryEntry[]>([]);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isRefineModalOpen, setIsRefineModalOpen] = useState(false);
    const [refineDirectives, setRefineDirectives] = useState('');
    const infographicRef = useRef<HTMLDivElement>(null);

    // --- EFFECTS ---
    useEffect(() => {
        try {
            const savedLibrary = localStorage.getItem('yedu-library');
            if (savedLibrary) {
                setLibrary(JSON.parse(savedLibrary));
            }
        } catch (error) {
            console.error("Failed to load library from localStorage", error);
        }
    }, []);

    useEffect(() => {
        document.body.className = visualTheme === 'Manuscript' ? 'theme-manuscript' : '';
    }, [visualTheme]);

    const saveLibrary = (newLibrary: LibraryEntry[]) => {
        setLibrary(newLibrary);
        try {
            localStorage.setItem('yedu-library', JSON.stringify(newLibrary));
        } catch (error) {
            console.error("Failed to save library to localStorage", error);
        }
    };
    
    // --- API & DATA HANDLING ---
    const handleFileSelect = async (file: File) => {
        if (!file) return;

        const supportedTypes = ['audio/mpeg', 'audio/mp3', 'audio/x-m4a', 'audio/mp4'];
        if (!supportedTypes.includes(file.type)) {
            alert(`Unsupported file type: ${file.type}. Please upload an MP3 or M4A file.`);
            return;
        }

        setIsLoading(true);
        setLoadingQuote("Transcribing your audio, one moment...");

        try {
            const base64Audio = await fileToBase64(file);
            const audioPart = {
                inlineData: {
                    mimeType: file.type,
                    data: base64Audio,
                },
            };
            const textPart = {
                text: "Please transcribe the following audio recording into clean, coherent text. Remove any filler words, stutters, or false starts. The output should be a single block of text representing the spoken content.",
            };

            const response = await model.generateContent({
                model: 'gemini-2.5-pro',
                contents: [{ role: 'user', parts: [textPart, audioPart] }],
            });

            const transcription = response.text;
            setSourceText(transcription);
            
            // Immediately generate analysis after successful transcription
            await handleGenerate(false, transcription);

        } catch (error) {
            console.error("Error transcribing audio:", error);
            alert(`An error occurred during transcription or analysis: ${error.message || 'Please try again.'}`);
            setIsLoading(false); // Ensure loading is turned off on error
        }
    };
    
    const getSystemPrompt = (lens: AnalysisLens, directives: string, theme: VisualTheme, task: string = "Analyze the provided transcript") => {
        return `
            Role: You are an AI Scholarly Architect and Data Visualization expert. Your domain is the synthesis of complex textual and spoken-word content into structured, insightful, and aesthetically refined academic summaries.
            Core Task: ${task}, strictly adhering to the user's specified [Analysis Lens] and [Custom Directives]. Your output must be a single, self-contained, interactive HTML file that functions as a rich, infographic-style summary.
            Input:
            - A full-text transcript.
            - An [Analysis Lens] selection from the user: "${lens}"
            - Optional [Custom Directives] from the user: "${directives}"
            - A [Visual Theme] selection: "${theme}"
            Output Specification: A Single, Well-Formed HTML File.
            Methodology & Required Content Structure:
            1.  Deep Analysis: First, synthesize the transcript's core theme, arguments, terminology, and logical flow, filtering everything through the prism of the user's chosen [Analysis Lens] and [Custom Directives].
            2.  Infographic Blueprint (Semantic HTML): Structure the output using the following sections. Omit any section that is not relevant to the source material.
                A. Main Title (<h1>): A concise, descriptive title reflecting the lesson's core topic.
                B. Core Thesis (<p class="intro">): A highlighted paragraph stating the central argument or takeaway.
                C. Key Concepts & Terminology (<section class="concepts-grid">): Present foundational ideas in a grid of "cards." Each card must contain a relevant emoji/icon, the concept's name (<h3>), and a clear definition (<p>). Use a <table> for direct comparisons if central to the analysis.
                D. Logical Flow / Schematic Diagram (<section class="flowchart">): If the content describes a process, hierarchy, or argument structure, represent it schematically using nested lists, text, and Unicode arrows (↓, →, ↳).
                E. Supporting Examples & Sources (<section class="examples">): Extract concrete examples.
                F. Questions for Further Inquiry (<section class="further-inquiry">): Generate 2-3 probing, open-ended questions that challenge the user to think more deeply about the material's implications.
                G. Concluding Summary (<p class="conclusion">): A final paragraph that recaps the main points and reinforces the core thesis.
            3.  HTML Formatting, Styling, and Interactivity:
                - Single File Output: All content must be in one HTML file. All CSS must be contained within a single <style> block in the <head>. DO NOT use external links for anything.
                - Bespoke Visual Themes: Apply internal CSS that corresponds to the user-selected [Visual Theme].
                  - Manuscript Theme: Use sepia/parchment backgrounds (#f5f1e8), dark brown text (#4a2c2a), serif fonts ('Frank Ruhl Libre'), and subtle gold/amber accents.
                  - Modern Scholar Theme: Use a clean off-white (#f8f9fa) or dark charcoal (#212529) background, sans-serif fonts ('Heebo'), and one bold, primary color for headings and borders.
                - Direct Editability: Ensure all primary text containers (h1-h6, p, li, th, td) have the contenteditable="true" attribute.
            4.  Trust & Verification Footer:
                - Conclude with a <footer> containing a Confidence Score (e.g., "Confidence: High") and disclaimers for any ambiguities.
            Final Constraint: The output language must strictly match the primary language of the input transcript.
        `;
    };

    const handleGenerate = async (isRefinement = false, textOverride?: string) => {
        const textToAnalyze = textOverride ?? (isRefinement ? currentAnalysis?.sourceText : sourceText);
        if (!textToAnalyze) {
            alert("Please provide some text to analyze.");
            return;
        }

        setIsLoading(true);
        setLoadingQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)]);
        
        try {
            const directives = isRefinement ? refineDirectives : customDirectives;
            const task = isRefinement ? "Refine the previous analysis based on the new directive" : "Analyze the provided transcript";
            const prompt = getSystemPrompt(analysisLens, directives, visualTheme, task);
            
            const response = await model.generateContent({
                model: 'gemini-2.5-pro',
                contents: [{ role: 'user', parts: [{ text: prompt }, { text: `Transcript to analyze: \n\n${textToAnalyze}` }] }],
            });
            
            const htmlOutput = response.text;
            
            // Defensive check to ensure htmlOutput is a string.
            // This can happen if the model's response is blocked due to safety settings or other reasons.
            if (!htmlOutput || typeof htmlOutput !== 'string') {
                console.error("Analysis generation returned an empty or invalid response:", response);
                throw new Error("The AI model returned an empty response. This could be due to content safety filters or an issue with the prompt. Please try modifying your input or directives.");
            }
            
            // Extract title from <h1> tag
            const titleMatch = htmlOutput.match(/<h1[^>]*>(.*?)<\/h1>/i);
            const title = titleMatch ? titleMatch[1] : "Untitled Analysis";

            if (isRefinement && currentAnalysis) {
                const updatedAnalysis: LibraryEntry = {
                    ...currentAnalysis,
                    infographicHtml: htmlOutput,
                    title,
                    refinementHistory: [...currentAnalysis.refinementHistory, directives],
                };
                setCurrentAnalysis(updatedAnalysis);
                const newLibrary = library.map(item => item.id === currentAnalysis.id ? updatedAnalysis : item);
                saveLibrary(newLibrary);
            } else {
                const newEntry: LibraryEntry = {
                    id: new Date().toISOString(),
                    title,
                    sourceText: textToAnalyze,
                    infographicHtml: htmlOutput,
                    analysisLens,
                    customDirectives,
                    visualTheme,
                    createdAt: new Date().toISOString(),
                    refinementHistory: [],
                };
                setCurrentAnalysis(newEntry);
                saveLibrary([newEntry, ...library]);
                setView('infographic');
            }
        } catch (error) {
            console.error("Error generating analysis:", error);
            alert((error as Error).message || "An error occurred while analyzing the text. Please try again.");
        } finally {
            setIsLoading(false);
            setIsRefineModalOpen(false);
            setRefineDirectives('');
        }
    };
    
    const handleSaveChanges = () => {
        if (!currentAnalysis || !infographicRef.current) return;
        
        const updatedHtml = infographicRef.current.innerHTML;
        const updatedAnalysis: LibraryEntry = {
            ...currentAnalysis,
            infographicHtml: updatedHtml,
        };
        
        setCurrentAnalysis(updatedAnalysis);
        const newLibrary = library.map(item => item.id === currentAnalysis.id ? updatedAnalysis : item);
        saveLibrary(newLibrary);
        alert("Changes saved to library.");
    };

    const handleDownloadHtml = () => {
        if (!currentAnalysis) return;
        const blob = new Blob([currentAnalysis.infographicHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentAnalysis.title.replace(/ /g, '_')}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const loadAnalysis = (entry: LibraryEntry) => {
        setCurrentAnalysis(entry);
        setSourceText(entry.sourceText);
        setAnalysisLens(entry.analysisLens as AnalysisLens);
        setCustomDirectives(entry.customDirectives);
        setVisualTheme(entry.visualTheme);
        setView('infographic');
        setIsSidebarOpen(false);
    }
    
    const startNewAnalysis = () => {
        setCurrentAnalysis(null);
        setSourceText('');
        setCustomDirectives('');
        setView('welcome');
    }

    return (
        <div style={{ position: 'relative', minHeight: '100vh', display: 'flex' }}>
            {isLoading && <LoadingOverlay quote={loadingQuote} />}
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} library={library} onLoad={loadAnalysis} />
            
            <main style={{ flex: 1, padding: '2rem', transition: 'margin-left 0.3s ease' }}>
                {view === 'welcome' && (
                    <WelcomeScreen
                        sourceText={sourceText}
                        setSourceText={setSourceText}
                        analysisLens={analysisLens}
                        setAnalysisLens={setAnalysisLens}
                        customDirectives={customDirectives}
                        setCustomDirectives={setCustomDirectives}
                        visualTheme={visualTheme}
                        setVisualTheme={setVisualTheme}
                        onGenerate={() => handleGenerate(false)}
                        onOpenLibrary={() => setIsSidebarOpen(true)}
                        onFileSelect={handleFileSelect}
                    />
                )}
                {view === 'infographic' && currentAnalysis && (
                    <InfographicScreen
                        analysis={currentAnalysis}
                        ref={infographicRef}
                        onSaveChanges={handleSaveChanges}
                        onRefine={() => setIsRefineModalOpen(true)}
                        onDownload={handleDownloadHtml}
                        onOpenLibrary={() => setIsSidebarOpen(true)}
                        onNewAnalysis={startNewAnalysis}
                    />
                )}
            </main>
            
            {isRefineModalOpen && (
                <RefineModal
                    onClose={() => setIsRefineModalOpen(false)}
                    onSubmit={() => handleGenerate(true)}
                    value={refineDirectives}
                    onChange={setRefineDirectives}
                />
            )}
        </div>
    );
};

// --- CHILD COMPONENTS ---

const WelcomeScreen = ({ sourceText, setSourceText, analysisLens, setAnalysisLens, customDirectives, setCustomDirectives, visualTheme, setVisualTheme, onGenerate, onOpenLibrary, onFileSelect }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            onFileSelect(file);
            // Reset file input to allow re-uploading the same file
            if(event.target) event.target.value = '';
        }
    };

    const triggerFileSelect = () => {
        fileInputRef.current?.click();
    };
    
    return (
        <div style={{ maxWidth: '700px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <header style={{ textAlign: 'center' }}>
                <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '3rem', margin: '0 0 0.5rem 0' }}>Yedu</h1>
                <p style={{ fontSize: '1.2rem', margin: 0, opacity: 0.8 }}>The Digital Chavruta</p>
                 <button onClick={onOpenLibrary} className="button-secondary" style={{ marginTop: '1rem' }}>Open Study Library</button>
            </header>

            <div>
                <label htmlFor="sourceText">Lesson Input (Audio, Upload, or Paste Text)</label>
                <div style={{ position: 'relative' }}>
                    <textarea
                        id="sourceText"
                        rows={12}
                        value={sourceText}
                        onChange={(e) => setSourceText(e.target.value)}
                        placeholder="Paste your lesson transcript here, or upload an audio file..."
                    />
                     <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        style={{ display: 'none' }}
                        accept="audio/mpeg,audio/mp3,audio/x-m4a,audio/mp4"
                    />
                    <button
                        onClick={triggerFileSelect}
                        className="button-secondary"
                        style={{ position: 'absolute', bottom: '1rem', right: '1rem' }}
                        title="Upload an MP3 or M4A audio file for transcription."
                    >
                       Upload Audio
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div>
                    <label htmlFor="analysisLens">Analysis Lens</label>
                    <select id="analysisLens" value={analysisLens} onChange={(e) => setAnalysisLens(e.target.value as AnalysisLens)}>
                        {ANALYSIS_LENSES.map(lens => <option key={lens} value={lens}>{lens}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="visualTheme">Visual Theme</label>
                    <select id="visualTheme" value={visualTheme} onChange={(e) => setVisualTheme(e.target.value as VisualTheme)}>
                        <option value="Modern Scholar">Modern Scholar</option>
                        <option value="Manuscript">Manuscript</option>
                    </select>
                </div>
            </div>

            <div>
                <label htmlFor="customDirectives">Custom Directives (Optional)</label>
                <input
                    id="customDirectives"
                    type="text"
                    value={customDirectives}
                    onChange={(e) => setCustomDirectives(e.target.value)}
                    placeholder="e.g., 'Focus on the commentary of Sforno'"
                />
            </div>

            <button onClick={onGenerate} className="button-primary" style={{ padding: '1rem' }}>
                Generate Analysis
            </button>
        </div>
    );
};

const InfographicScreen = React.forwardRef<HTMLDivElement, { analysis: LibraryEntry, onSaveChanges: () => void, onRefine: () => void, onDownload: () => void, onOpenLibrary: () => void, onNewAnalysis: () => void }>(({ analysis, onSaveChanges, onRefine, onDownload, onOpenLibrary, onNewAnalysis }, ref) => (
    <div>
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, background: 'var(--bg-color)', zIndex: 100, boxShadow: 'var(--shadow-md)', padding: '0.75rem 2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
             <button onClick={onOpenLibrary} className="button-icon" title="Open Library"><LibraryIcon /></button>
             <button onClick={onNewAnalysis} className="button-icon" title="New Analysis"><PlusIcon/></button>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={analysis.title}>{analysis.title}</h2>
             <button onClick={onSaveChanges} className="button-secondary">Save Edits</button>
             <button onClick={onDownload} className="button-secondary">Download HTML</button>
        </div>
        <div ref={ref} dangerouslySetInnerHTML={{ __html: analysis.infographicHtml }} style={{ marginTop: '80px' }} />
        <button onClick={onRefine} className="button-primary" style={{ position: 'fixed', bottom: '2rem', right: '2rem', borderRadius: '50px', boxShadow: 'var(--shadow-lg)', padding: '1rem 1.5rem' }}>
            Refine & Re-Analyze
        </button>
    </div>
));

const Sidebar = ({ isOpen, onClose, library, onLoad }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const filteredLibrary = useMemo(() => {
        if (!searchTerm) return library;
        return library.filter(item => 
            item.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
            item.sourceText.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [searchTerm, library]);

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, bottom: 0, width: '350px',
            transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.3s ease-out',
            backgroundColor: 'var(--bg-color)', boxShadow: 'var(--shadow-lg)',
            zIndex: 200, display: 'flex', flexDirection: 'column'
        }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)'}}>Study Library</h2>
                <button onClick={onClose} className="button-icon"><CloseIcon /></button>
            </div>
            <div style={{ padding: '1rem' }}>
                <input type="search" placeholder="Search library..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, overflowY: 'auto', flex: 1 }}>
                {filteredLibrary.map(item => (
                    <li key={item.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
                        <button onClick={() => onLoad(item)} style={{
                            width: '100%', textAlign: 'left', background: 'none', border: 'none',
                            padding: '1rem', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit'
                        }}>
                            <strong style={{ display: 'block', fontFamily: 'var(--font-sans)', fontWeight: 600 }}>{item.title}</strong>
                            <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>{new Date(item.createdAt).toLocaleString()}</span>
                        </button>
                    </li>
                ))}
                 {library.length === 0 && <p style={{textAlign: 'center', padding: '1rem', opacity: 0.7}}>Your library is empty.</p>}
            </ul>
        </div>
    );
};

const RefineModal = ({ onClose, onSubmit, value, onChange }) => (
    <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, fontFamily: 'var(--font-serif)'}}>Refine & Re-Analyze</h3>
            <p>Issue new instructions to be run on the original source material.</p>
            <textarea
                rows={5}
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder="e.g., 'Reformat the flowchart into a simple bulleted list.'"
            />
            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button onClick={onClose} className="button-secondary">Cancel</button>
                <button onClick={onSubmit} className="button-primary">Submit</button>
            </div>
        </div>
    </div>
);

const LoadingOverlay = ({ quote }) => (
    <div className="loading-overlay">
        <div className="loading-spinner"></div>
        <p className="loading-quote">"{quote}"</p>
    </div>
);

// --- ICONS ---
const LibraryIcon = () => (<svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20v2H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v15H6.5A2.5 2.5 0 0 1 4 4.5v15zM6 4h12V3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21H20v-1H6.5A1.5 1.5 0 0 0 5 19.5v-15A1.5 1.5 0 0 0 6.5 3H20v1H6z"></path></svg>);
const PlusIcon = () => (<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>);
const CloseIcon = () => (<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>);

// --- RENDER APP ---
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<React.StrictMode><App /></React.StrictMode>);