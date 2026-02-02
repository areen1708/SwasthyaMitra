import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from "react-dom/client";
import { GoogleGenAI } from "@google/genai";
import * as LucideIcons from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';

// --- ICONS ---
const { 
  Activity, AlertTriangle, Box, Calendar, CheckCircle, ChevronRight, Clipboard, LogOut, 
  MapPin, MessageSquare, Moon, Package, Pill, Send, ShieldAlert, Sparkles, 
  Stethoscope, Sun, User, Users, Video, Phone, Clock, Check, Plus, Utensils, 
  FilePenLine, Coffee, FlaskConical, ShieldCheck, Droplet, Upload, Edit2, Save, 
  ArrowLeft, Trash2, Map, Star, X, Camera, PhoneCall, Siren
} = LucideIcons;

// --- GEMINI SETUP ---
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const callGeminiAPI = async (prompt: string, systemInstruction: string, imageBase64: string | null = null) => {
  try {
    // Select model based on input type
    const model = imageBase64 ? "gemini-2.5-flash-image" : "gemini-3-flash-preview";
    
    const parts: any[] = [];
    if (imageBase64) {
        // Extract base64 data if it includes the prefix
        const base64Data = imageBase64.split(',')[1] || imageBase64;
        parts.push({
            inlineData: {
                mimeType: "image/png",
                data: base64Data
            }
        });
    }
    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: model,
      contents: { parts },
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json", 
        // Note: For image models, responseMimeType JSON might be soft-enforced, 
        // but we'll parse safely.
      }
    });

    const text = response.text || "{}";
    // Sanitize JSON markdown if present
    const jsonStr = text.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    return JSON.parse(jsonStr);

  } catch (error) {
    console.error("Gemini Error:", error);
    return { error: true };
  }
};

// --- MOCK FIREBASE ---
// This shim replaces Firebase with local storage and in-memory events
// to allow the app to function without a real backend config.

const listeners = new Set<any>();
const LOCAL_STORAGE_KEY = 'swasthya_mock_db_v1';

// Initial Seed Data
const defaultData = {
    'artifacts/default-app-id/public/data/city_stats': [
        { id: '1', name: 'Jaipur', fever: 120, dengue: 15, malaria: 5, active: 140, risk: 'High' },
        { id: '2', name: 'Rampur', fever: 45, dengue: 2, malaria: 0, active: 47, risk: 'Low' },
        { id: '3', name: 'Kota', fever: 80, dengue: 10, malaria: 8, active: 98, risk: 'Medium' },
    ],
    'artifacts/default-app-id/public/data/inventory': [
        { id: '1', name: 'Paracetamol 500mg', stock: 120, category: 'Fever', image: '' },
        { id: '2', name: 'Amoxicillin 250mg', stock: 40, category: 'Antibiotic', image: '' },
        { id: '3', name: 'ORS Packets', stock: 500, category: 'Hydration', image: '' },
        { id: '4', name: 'Ibuprofen', stock: 0, category: 'Pain Relief', image: '' },
    ],
    'artifacts/default-app-id/public/data/users': [],
    'artifacts/default-app-id/public/data/appointments': [],
    'artifacts/default-app-id/public/data/patient_history': [],
    'artifacts/default-app-id/public/data/patient_treatments': []
};

const loadDb = () => {
    try {
        const s = localStorage.getItem(LOCAL_STORAGE_KEY);
        return s ? { ...defaultData, ...JSON.parse(s) } : defaultData;
    } catch { return defaultData; }
};

const saveDb = (data: any) => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
};

let dbData = loadDb();

// Firebase Mock Functions
const getFirestore = () => ({});
const getAuth = () => ({ currentUser: { uid: 'mock-uid-123' } });
const signInAnonymously = async () => ({});
const signInWithCustomToken = async () => ({});
const appId = 'default-app-id';

// Simplified Collection Path
const collection = (db: any, ...path: string[]) => path.join('/');

// Mock Listeners
const onSnapshot = (queryObj: any, callback: any) => {
    const run = () => {
        let docs = dbData[queryObj.path] || [];
        // Apply basic filtering
        if (queryObj.constraints) {
            queryObj.constraints.forEach((c: any) => {
                if (c.type === 'where') {
                    docs = docs.filter((d: any) => d[c.field] === c.value);
                }
            });
        }
        // Mock snapshot object
        callback({
            empty: docs.length === 0,
            docs: docs.map((d: any) => ({
                id: d.id,
                data: () => d
            }))
        });
    };
    
    run(); // Initial call
    
    const listener = { path: queryObj.path, run };
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

// Queries
const query = (colPath: string, ...constraints: any[]) => ({ path: colPath, constraints });
const where = (field: string, op: string, value: any) => ({ type: 'where', field, value });
const orderBy = () => ({ type: 'orderBy' }); // Ignored in mock
const limit = () => ({ type: 'limit' }); // Ignored in mock
const serverTimestamp = () => new Date().toISOString();

// Mutations
const addDoc = async (colPath: any, data: any) => {
    const id = Date.now().toString();
    const doc = { id, ...data };
    if (!dbData[colPath]) dbData[colPath] = [];
    dbData[colPath].push(doc);
    saveDb(dbData);
    notify(colPath);
    return { id };
};

const updateDoc = async (docRef: any, data: any) => {
    const list = dbData[docRef.path];
    const idx = list.findIndex((d: any) => d.id === docRef.id);
    if (idx > -1) {
        list[idx] = { ...list[idx], ...data };
        saveDb(dbData);
        notify(docRef.path);
    }
};

const deleteDoc = async (docRef: any) => {
    const list = dbData[docRef.path];
    const idx = list.findIndex((d: any) => d.id === docRef.id);
    if (idx > -1) {
        list.splice(idx, 1);
        saveDb(dbData);
        notify(docRef.path);
    }
};

const getDocs = async (queryObj: any) => {
     let docs = dbData[queryObj.path] || [];
     if (queryObj.constraints) {
         queryObj.constraints.forEach((c: any) => {
             if (c.type === 'where') docs = docs.filter((d: any) => d[c.field] === c.value);
         });
     }
     return {
         empty: docs.length === 0,
         docs: docs.map((d: any) => ({ id: d.id, data: () => d }))
     };
};

const doc = (db: any, path: string, id: string) => ({ path, id });
const getPublicCollection = (colName: string) => collection(null, 'artifacts', appId, 'public', 'data', colName);

const notify = (path: string) => {
    listeners.forEach((l: any) => {
        if (l.path === path) l.run();
    });
};

// --- UI COMPONENTS ---

const Toast = ({ message, type, onClose }: any) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bg = type === 'error' ? 'bg-red-500' : 'bg-green-600';
  return (
    <div className={`fixed top-4 right-4 ${bg} text-white px-4 py-2 rounded-lg shadow-xl z-50 animate-fade-in-up flex items-center gap-2`}>
      {type === 'error' ? <AlertTriangle size={16}/> : <CheckCircle size={16}/>}
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
};

const Button = ({ children, onClick, variant = 'primary', className = '', ...props }: any) => {
  const base = "px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants: any = {
    primary: "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30",
    secondary: "bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-300 dark:hover:bg-slate-600",
    danger: "bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30",
    outline: "border-2 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-blue-500 hover:text-blue-500",
    gemini: "bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700 shadow-lg shadow-purple-500/30",
    video: "bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-500/30",
    ghost: "bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
  };
  return <button onClick={onClick} className={`${base} ${variants[variant]} ${className}`} {...props}>{children}</button>;
};

const Card = ({ children, className = '', title, action, onClick }: any) => (
  <div onClick={onClick} className={`bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 ${onClick ? 'cursor-pointer' : ''} ${className}`}>
    {(title || action) && (
      <div className="flex justify-between items-center mb-4">
        {title && <h3 className="font-semibold text-lg text-slate-800 dark:text-white">{title}</h3>}
        {action}
      </div>
    )}
    {children}
  </div>
);

const Badge = ({ type, text }: any) => {
  const styles: any = {
    critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800',
    warning: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800',
    success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800',
    info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800',
  };
  return <span className={`px-2 py-1 rounded-full text-xs font-semibold ${styles[type] || styles.info}`}>{text}</span>;
};

// --- FEATURE COMPONENTS ---

const SOSButton = () => {
    const [showModal, setShowModal] = useState(false);

    return (
        <>
            <button 
                onClick={() => setShowModal(true)}
                className="fixed bottom-6 right-6 z-50 w-16 h-16 bg-red-600 rounded-full shadow-2xl flex items-center justify-center text-white animate-pulse-red hover:bg-red-700 transition-colors border-4 border-red-400"
            >
                <PhoneCall size={32} />
            </button>

            {showModal && (
                <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in-up">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-red-500">
                        <div className="bg-red-600 p-6 text-white text-center">
                            <Siren size={48} className="mx-auto mb-2 animate-bounce" />
                            <h2 className="text-3xl font-bold uppercase tracking-wider">Emergency SOS</h2>
                            <p className="opacity-90">Select service to call immediately</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <a href="tel:102" className="flex items-center gap-4 w-full p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors group">
                                <div className="w-12 h-12 bg-red-100 dark:bg-red-800 rounded-full flex items-center justify-center text-red-600 dark:text-red-200 group-hover:scale-110 transition-transform">
                                    <Activity size={24} />
                                </div>
                                <div className="text-left">
                                    <div className="font-bold text-xl text-slate-900 dark:text-white">Ambulance</div>
                                    <div className="text-sm text-slate-500 dark:text-slate-400">Medical Emergency • 102</div>
                                </div>
                            </a>
                            
                            <a href="tel:100" className="flex items-center gap-4 w-full p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors group">
                                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-800 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-200 group-hover:scale-110 transition-transform">
                                    <ShieldAlert size={24} />
                                </div>
                                <div className="text-left">
                                    <div className="font-bold text-xl text-slate-900 dark:text-white">Police</div>
                                    <div className="text-sm text-slate-500 dark:text-slate-400">Safety & Security • 100</div>
                                </div>
                            </a>

                             <a href="tel:112" className="flex items-center gap-4 w-full p-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-xl hover:bg-yellow-100 dark:hover:bg-yellow-900/50 transition-colors group">
                                <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-800 rounded-full flex items-center justify-center text-yellow-600 dark:text-yellow-200 group-hover:scale-110 transition-transform">
                                    <Phone size={24} />
                                </div>
                                <div className="text-left">
                                    <div className="font-bold text-xl text-slate-900 dark:text-white">General Emergency</div>
                                    <div className="text-sm text-slate-500 dark:text-slate-400">All Services • 112</div>
                                </div>
                            </a>
                        </div>
                        <div className="p-4 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
                            <button onClick={() => setShowModal(false)} className="w-full py-3 rounded-lg font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

const DailyHealthTip = ({ user }: any) => {
  const [tip, setTip] = useState<string|null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTip = async () => {
      const prompt = `Generate a single, short (max 2 sentences), actionable health tip for a ${user.age || 'adult'} year old person living in ${user.city || 'India'}. Consider local climate or common regional health issues.`;
      const system = "You are a friendly doctor. Output JSON: { \"tip\": \"string\" }";
      try {
        const res = await callGeminiAPI(prompt, system);
        setTip(res.tip);
      } catch (e) {
        setTip("Stay hydrated and eat fresh, seasonal vegetables.");
      }
      setLoading(false);
    };
    fetchTip();
  }, [user]);

  if (loading) return <div className="p-6 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl text-white animate-pulse mb-6">Loading daily health wisdom...</div>;

  return (
    <div className="p-6 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl text-white shadow-lg mb-6 flex items-start gap-4 transform hover:scale-[1.01] transition-transform">
      <Sparkles className="flex-shrink-0 mt-1 text-yellow-300" size={24} />
      <div>
        <h3 className="font-bold text-lg mb-1">Daily Health Wisdom</h3>
        <p className="opacity-90 leading-relaxed">{tip}</p>
      </div>
    </div>
  );
};

const CityManager = ({ user, setNotification }: any) => {
  const [cities, setCities] = useState<any[]>([]);
  const [selectedCity, setSelectedCity] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [geminiAnalysis, setGeminiAnalysis] = useState<any>(null);
  const [loadingGemini, setLoadingGemini] = useState(false);
  const [ashaWorkers, setAshaWorkers] = useState<any[]>([]);

  useEffect(() => {
    // 1. Fetch Cities
    const q = query(getPublicCollection('city_stats'));
    const unsub = onSnapshot(q, (snapshot: any) => {
        const data = snapshot.docs.map((d: any) => ({id: d.id, ...d.data()}));
        setCities(data);
        
        if (!selectedCity && data.length > 0) {
            if (user.role === 'asha' && user.city) {
                const ashaCity = data.find((c: any) => c.name.toLowerCase() === user.city.toLowerCase());
                if (ashaCity) setSelectedCity(ashaCity);
                else setSelectedCity(data[0]);
            } else {
                const jaipur = data.find((c: any) => c.name === 'Jaipur');
                if (jaipur) setSelectedCity(jaipur);
                else setSelectedCity(data[0]);
            }
        } else if (selectedCity) {
            // Update selected city with new data
            const updated = data.find((c:any) => c.id === selectedCity.id);
            if(updated) setSelectedCity(updated);
        }
    });

    // 2. Fetch ASHA Workers
    let unsubAsha = () => {};
    if (user.role === 'admin') {
        const qAsha = query(getPublicCollection('users'), where('role', '==', 'asha'));
        unsubAsha = onSnapshot(qAsha, (snapshot: any) => {
            const workers = snapshot.docs.map((d: any) => ({id: d.id, ...d.data()}));
            setAshaWorkers(workers);
        });
    }

    return () => { unsub(); unsubAsha(); };
  }, [user?.role, user?.city]);

  const handleSave = async () => {
      if (!selectedCity || !selectedCity.id) return;
      try {
          await updateDoc(doc(null, getPublicCollection('city_stats'), selectedCity.id), {
              fever: Number(editForm.fever),
              dengue: Number(editForm.dengue),
              malaria: Number(editForm.malaria),
              active: Number(editForm.fever) + Number(editForm.dengue) + Number(editForm.malaria),
              risk: (Number(editForm.fever) > 100 || Number(editForm.dengue) > 10) ? 'High' : 'Medium'
          });
          setIsEditing(false);
          setNotification({ type: 'success', message: 'City stats updated' });
      } catch (e) {
          setNotification({ type: 'error', message: 'Update failed' });
      }
  };

  const handleAnalyzeTrends = async () => {
      if (!selectedCity) return;
      setLoadingGemini(true);
      const prompt = `Analyze: ${selectedCity.name} Health Stats. Fever: ${selectedCity.fever}, Dengue: ${selectedCity.dengue}, Malaria: ${selectedCity.malaria}. Total Active: ${selectedCity.active}.`;
      const systemPrompt = "Public health official analysis. Output JSON: { 'risk_assessment': 'string', 'action_items': ['string', 'string'] }";
      
      const result = await callGeminiAPI(prompt, systemPrompt);
      if (!result.error) setGeminiAnalysis(result);
      else setNotification({ type: 'error', message: "Gemini Service Unavailable" });
      
      setLoadingGemini(false);
  };

  const getTrendData = (city: any) => {
      if (!city) return [];
      const base = city.active / 5;
      return [
          { name: 'Mon', Cases: Math.floor(base * 0.8) },
          { name: 'Tue', Cases: Math.floor(base * 0.9) },
          { name: 'Wed', Cases: Math.floor(base * 1.1) },
          { name: 'Thu', Cases: Math.floor(base * 1.0) },
          { name: 'Fri', Cases: Math.floor(base * 1.2) },
          { name: 'Sat', Cases: Math.floor(city.active) },
      ];
  };

  const visibleCities = user.role === 'asha' 
    ? cities.filter(c => c.name.toLowerCase() === (user.city || '').toLowerCase()) 
    : cities;

  return (
    <div className="space-y-6">
        {user.role === 'admin' && (
            <Card title="Health Workforce (ASHA)" action={<Badge type="info" text={`${ashaWorkers.length} Active`} />}>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-700/50">
                            <tr>
                                <th className="p-3">Worker ID</th>
                                <th className="p-3">Name</th>
                                <th className="p-3">Assigned City</th>
                                <th className="p-3">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ashaWorkers.length > 0 ? ashaWorkers.map(w => (
                                <tr key={w.id} className="border-b border-slate-100 dark:border-slate-700">
                                    <td className="p-3 font-mono font-bold text-blue-600">{w.swasthyaId || 'PENDING'}</td>
                                    <td className="p-3 font-medium">{w.name}</td>
                                    <td className="p-3">{w.city}</td>
                                    <td className="p-3"><span className="w-2 h-2 rounded-full bg-green-500 inline-block mr-2"></span>Active</td>
                                </tr>
                            )) : (
                                <tr><td colSpan={4} className="p-4 text-center text-slate-500">No ASHA workers registered yet.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
            <Card title={user.role === 'asha' ? `My Area: ${user.city}` : "Live Heat Map"}>
                <div className="grid grid-cols-2 gap-2 max-h-[500px] overflow-y-auto">
                    {visibleCities.length > 0 ? visibleCities.map(city => (
                        <div 
                            key={city.id} 
                            onClick={() => { setSelectedCity(city); setEditForm(city); setIsEditing(false); setGeminiAnalysis(null); }}
                            className={`p-3 rounded-lg border cursor-pointer hover:opacity-80 transition-all text-center flex flex-col justify-center min-h-[100px] ${
                                city.risk === 'High' ? 'bg-red-100 border-red-200 dark:bg-red-900/30 dark:border-red-800' :
                                city.risk === 'Medium' ? 'bg-orange-100 border-orange-200 dark:bg-orange-900/30 dark:border-orange-800' :
                                'bg-green-100 border-green-200 dark:bg-green-900/30 dark:border-green-800'
                            } ${selectedCity?.id === city.id ? 'ring-2 ring-blue-500' : ''}`}
                        >
                            <span className="font-bold dark:text-white block">{city.name}</span>
                            <span className="text-xs opacity-70 dark:text-slate-300 block mt-1">{city.active} Cases</span>
                            <Badge type={city.risk === 'High' ? 'critical' : city.risk === 'Medium' ? 'warning' : 'success'} text={city.risk} />
                        </div>
                    )) : (
                        <div className="col-span-2 text-center text-sm text-slate-500 p-4">
                            No data found for {user.city}.
                        </div>
                    )}
                </div>
            </Card>

            <div className="lg:col-span-2 space-y-6">
                {selectedCity ? (
                    <Card title={`Health Command: ${selectedCity.name}`} action={
                        user?.role === 'admin' && (
                            !isEditing 
                            ? <Button variant="secondary" className="text-xs" onClick={() => { setIsEditing(true); setEditForm(selectedCity); }}><Edit2 size={14}/> Update Data</Button>
                            : <Button className="text-xs" onClick={handleSave}><Save size={14}/> Save Changes</Button>
                        )
                    }>
                        <div className="grid grid-cols-3 gap-4 mb-6">
                            <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-800 text-center">
                                <div className="text-xs text-red-500 uppercase font-bold">Fever</div>
                                {isEditing ? <input type="number" className="w-full mt-1 bg-white dark:bg-slate-700 dark:text-white p-2 rounded text-center border dark:border-slate-600 font-bold" value={editForm.fever} onChange={(e:any) => setEditForm({...editForm, fever: e.target.value})} /> : <div className="text-2xl font-bold text-red-700 dark:text-red-400">{selectedCity.fever}</div>}
                            </div>
                            <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-xl border border-orange-100 dark:border-orange-800 text-center">
                                <div className="text-xs text-orange-500 uppercase font-bold">Dengue</div>
                                {isEditing ? <input type="number" className="w-full mt-1 bg-white dark:bg-slate-700 dark:text-white p-2 rounded text-center border dark:border-slate-600 font-bold" value={editForm.dengue} onChange={(e:any) => setEditForm({...editForm, dengue: e.target.value})} /> : <div className="text-2xl font-bold text-orange-700 dark:text-orange-400">{selectedCity.dengue}</div>}
                            </div>
                            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-100 dark:border-yellow-800 text-center">
                                <div className="text-xs text-yellow-500 uppercase font-bold">Malaria</div>
                                {isEditing ? <input type="number" className="w-full mt-1 bg-white dark:bg-slate-700 dark:text-white p-2 rounded text-center border dark:border-slate-600 font-bold" value={editForm.malaria} onChange={(e:any) => setEditForm({...editForm, malaria: e.target.value})} /> : <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{selectedCity.malaria}</div>}
                            </div>
                        </div>

                        <div className="mb-6">
                            <Button variant="gemini" className="w-full" onClick={handleAnalyzeTrends} disabled={loadingGemini}>
                                {loadingGemini ? 'Analyzing...' : <><Sparkles size={16}/> Analyze Trends with Gemini</>}
                            </Button>
                            {geminiAnalysis && (
                                <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-800 animate-fade-in-up">
                                    <h4 className="font-bold text-purple-700 dark:text-purple-300 text-sm mb-2">Gemini Intelligence:</h4>
                                    <p className="text-sm text-slate-700 dark:text-slate-300 mb-3">{geminiAnalysis.risk_assessment}</p>
                                    <ul className="list-disc list-inside text-xs text-slate-600 dark:text-slate-400">
                                        {geminiAnalysis.action_items?.map((item:any, i:number) => <li key={i}>{item}</li>)}
                                    </ul>
                                </div>
                            )}
                        </div>

                        <div className="h-64 relative">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={getTrendData(selectedCity)}>
                                    <defs>
                                        <linearGradient id="colorCases" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b8" opacity={0.2} />
                                    <XAxis dataKey="name" />
                                    <YAxis />
                                    <Tooltip contentStyle={{backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff'}} />
                                    <Area type="monotone" dataKey="Cases" stroke="#ef4444" fillOpacity={1} fill="url(#colorCases)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>
                ) : (
                    <Card className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
                        <MapPin size={48} className="mb-4 opacity-50" />
                        <p>Select a city from the Heat Map.</p>
                    </Card>
                )}
            </div>
        </div>
    </div>
  );
};

const InventoryManager = ({ user, setNotification }: any) => {
    const [inventory, setInventory] = useState<any[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ name: '', stock: '', category: '', image: '' });
    const [editingId, setEditingId] = useState<any>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<any>(null);

    useEffect(() => {
        const q = query(getPublicCollection('inventory'));
        const unsub = onSnapshot(q, (snapshot: any) => {
            setInventory(snapshot.docs.map((d: any) => ({id: d.id, ...d.data()})));
        });
        return () => { unsub(); };
    }, []);

    const handleSubmit = async () => {
        if (!formData.name || !formData.stock) {
            setNotification({type: 'error', message: 'Name and Stock are required'});
            return;
        }

        try {
            if (editingId) {
                await updateDoc(doc(null, getPublicCollection('inventory'), editingId), {
                    ...formData,
                    stock: Number(formData.stock),
                    updatedBy: user.name,
                    lastUpdated: serverTimestamp()
                });
                setNotification({ type: 'success', message: 'Medicine updated successfully' });
            } else {
                await addDoc(getPublicCollection('inventory'), {
                    ...formData,
                    stock: Number(formData.stock),
                    updatedBy: user.name,
                    timestamp: serverTimestamp()
                });
                setNotification({ type: 'success', message: 'Medicine added successfully' });
            }
            setShowForm(false);
            setFormData({ name: '', stock: '', category: '', image: '' });
            setEditingId(null);
        } catch (e) {
            setNotification({ type: 'error', message: 'Operation failed' });
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteDoc(doc(null, getPublicCollection('inventory'), id));
            setNotification({ type: 'success', message: 'Medicine removed' });
            setDeleteConfirm(null);
        } catch (e) {
            setNotification({ type: 'error', message: 'Delete failed' });
        }
    };

    const startEdit = (item: any) => {
        setFormData({
            name: item.name,
            stock: item.stock,
            category: item.category,
            image: item.image || ''
        });
        setEditingId(item.id);
        setShowForm(true);
    };

    const canManage = user.role === 'admin' || user.role === 'asha';

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold dark:text-white">Medical Inventory</h2>
                {canManage && (
                    <Button onClick={() => { setShowForm(!showForm); setEditingId(null); setFormData({name:'', stock:'', category:'', image:''}); }}>
                        {showForm ? 'Cancel' : <><Plus size={18} /> Add Medicine</>}
                    </Button>
                )}
            </div>

            {showForm && (
                <Card className="animate-fade-in-up bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800">
                    <h3 className="font-bold mb-4 dark:text-white">{editingId ? 'Edit Medicine' : 'Add New Medicine'}</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                        <input className="p-2 rounded border bg-white dark:bg-slate-700 dark:text-white dark:border-slate-600" placeholder="Medicine Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                        <input className="p-2 rounded border bg-white dark:bg-slate-700 dark:text-white dark:border-slate-600" placeholder="Quantity (e.g., 100)" type="number" value={formData.stock} onChange={e => setFormData({...formData, stock: e.target.value})} />
                        <input className="p-2 rounded border bg-white dark:bg-slate-700 dark:text-white dark:border-slate-600" placeholder="Category (Fever, Pain...)" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} />
                        <input className="p-2 rounded border bg-white dark:bg-slate-700 dark:text-white dark:border-slate-600" placeholder="Image URL (http://...)" value={formData.image} onChange={e => setFormData({...formData, image: e.target.value})} />
                    </div>
                    <Button className="mt-4 w-full" onClick={handleSubmit}>
                        {editingId ? <><Save size={16}/> Update Details</> : <><Plus size={16}/> Add to Stock</>}
                    </Button>
                </Card>
            )}

            <Card>
                <div className="overflow-x-auto max-h-[600px]">
                    <table className="w-full text-left">
                        <thead className="sticky top-0 bg-white dark:bg-slate-800 shadow-sm z-10">
                            <tr className="text-slate-500 dark:text-slate-400 text-xs uppercase border-b border-slate-200 dark:border-slate-700">
                                <th className="p-4">Image</th>
                                <th className="p-4">Medicine Name</th>
                                <th className="p-4">Category</th>
                                <th className="p-4">Availability</th>
                                {canManage && <th className="p-4">Stock</th>}
                                {canManage && <th className="p-4">Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {inventory.map((item) => (
                                <tr key={item.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                    <td className="p-4">
                                        <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 overflow-hidden flex items-center justify-center">
                                            {item.image ? <img src={item.image} alt="" className="w-full h-full object-cover" onError={(e:any) => e.target.style.display='none'} /> : <Pill size={18} className="text-slate-400" />}
                                        </div>
                                    </td>
                                    <td className="p-4 font-medium text-slate-800 dark:text-slate-200">{item.name}</td>
                                    <td className="p-4 text-xs text-slate-500 dark:text-slate-400">{item.category}</td>
                                    <td className="p-4">
                                        <Badge type={item.stock < 10 ? 'critical' : item.stock < 50 ? 'warning' : 'success'} text={item.stock < 10 ? 'Out of Stock' : item.stock < 50 ? 'Low Stock' : 'Available'} />
                                    </td>
                                    {canManage && <td className="p-4 font-mono dark:text-slate-300">{item.stock}</td>}
                                    {canManage && (
                                        <td className="p-4">
                                            <div className="flex gap-2">
                                                <button onClick={() => startEdit(item)} className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"><Edit2 size={16}/></button>
                                                {deleteConfirm === item.id ? (
                                                    <button onClick={() => handleDelete(item.id)} className="p-2 bg-red-600 text-white rounded text-xs">Confirm</button>
                                                ) : (
                                                    <button onClick={() => setDeleteConfirm(item.id)} className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"><Trash2 size={16}/></button>
                                                )}
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

const AppointmentManager = ({ user, setNotification }: any) => {
    const [appointments, setAppointments] = useState<any[]>([]);
    const [view, setView] = useState('list');
    const [bookForm, setBookForm] = useState({ doctorId: '', doctorName: '', date: '', time: '' });
    
    const doctors = [
        { id: 1, name: 'Dr. Anjali Gupta', spec: 'General Physician' },
        { id: 2, name: 'Dr. Rajesh Koothrappali', spec: 'Pediatrician' },
        { id: 3, name: 'Dr. Sunita Williams', spec: 'Gynecologist' },
    ];

    useEffect(() => {
        let q;
        if (user.role === 'patient') {
            q = query(getPublicCollection('appointments'), where('patientId', '==', user.uid));
        } else {
            q = query(getPublicCollection('appointments'));
        }
        
        const unsub = onSnapshot(q, (snapshot: any) => {
            const data = snapshot.docs.map((d: any) => ({id: d.id, ...d.data()}));
            data.sort((a: any, b: any) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
            setAppointments(data);
        });
        return () => { unsub(); };
    }, [user.uid, user.role]);

    const handleBook = async () => {
        if (!bookForm.doctorName || !bookForm.date) {
            setNotification({ type: 'error', message: "Please fill details" });
            return;
        }
        try {
            await addDoc(getPublicCollection('appointments'), {
                patientId: user.uid,
                patientName: user.name,
                doctorId: bookForm.doctorId,
                doctorName: bookForm.doctorName,
                date: bookForm.date,
                time: bookForm.time,
                status: 'Pending',
                rating: null,
                timestamp: serverTimestamp()
            });
            setNotification({ type: 'success', message: "Appointment Requested" });
            setView('list');
            setBookForm({ doctorId: '', doctorName: '', date: '', time: '' });
        } catch (e) {
            setNotification({ type: 'error', message: "Booking failed" });
        }
    };

    const handleStatusUpdate = async (id: string, status: string) => {
        try {
            await updateDoc(doc(null, getPublicCollection('appointments'), id), { status });
            setNotification({ type: 'success', message: `Marked as ${status}` });
        } catch (e) {
            setNotification({ type: 'error', message: "Update failed" });
        }
    };

    const handleRating = async (id: string, rating: number) => {
        try {
            await updateDoc(doc(null, getPublicCollection('appointments'), id), { rating });
            setNotification({ type: 'success', message: "Thank you for rating!" });
        } catch (e) {
            setNotification({ type: 'error', message: "Rating failed" });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold dark:text-white">Appointments</h2>
                {user.role === 'patient' && (
                    <Button onClick={() => setView(view === 'list' ? 'book' : 'list')}>
                        {view === 'list' ? <><Plus size={18}/> Book New</> : 'Cancel'}
                    </Button>
                )}
            </div>

            {view === 'book' && (
                <Card title="Book Appointment" className="animate-fade-in-up">
                    <div className="grid md:grid-cols-2 gap-4">
                        <select 
                            className="p-3 rounded border bg-white dark:bg-slate-700 dark:text-white dark:border-slate-600"
                            onChange={e => {
                                const doc = doctors.find(d => d.id === Number(e.target.value));
                                if(doc) setBookForm({...bookForm, doctorId: String(doc.id), doctorName: doc.name});
                            }}
                        >
                            <option value="">Select Doctor</option>
                            {doctors.map(d => <option key={d.id} value={d.id}>{d.name} ({d.spec})</option>)}
                        </select>
                        <input type="date" className="p-3 rounded border bg-white dark:bg-slate-700 dark:text-white dark:border-slate-600" onChange={e => setBookForm({...bookForm, date: e.target.value})} />
                        <input type="time" className="p-3 rounded border bg-white dark:bg-slate-700 dark:text-white dark:border-slate-600" onChange={e => setBookForm({...bookForm, time: e.target.value})} />
                    </div>
                    <Button className="mt-4 w-full" onClick={handleBook}>Confirm Booking</Button>
                </Card>
            )}

            <div className="grid gap-4">
                {appointments.length === 0 ? (
                    <div className="text-center p-8 text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                        No appointments found.
                    </div>
                ) : (
                    appointments.map(apt => (
                        <Card key={apt.id} className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <h4 className="font-bold text-lg dark:text-white">{user.role === 'patient' ? apt.doctorName : apt.patientName}</h4>
                                    <Badge type={apt.status === 'Completed' ? 'success' : 'warning'} text={apt.status} />
                                </div>
                                <div className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-3">
                                    <span className="flex items-center gap-1"><Calendar size={14}/> {apt.date}</span>
                                    <span className="flex items-center gap-1"><Clock size={14}/> {apt.time}</span>
                                    {user.role !== 'patient' && <span className="flex items-center gap-1"><User size={14}/> With {apt.doctorName}</span>}
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                {user.role !== 'patient' && apt.status === 'Pending' && (
                                    <Button variant="secondary" className="text-xs" onClick={() => handleStatusUpdate(apt.id, 'Completed')}>
                                        <Check size={14}/> Mark Completed
                                    </Button>
                                )}

                                {user.role === 'patient' && apt.status === 'Completed' && !apt.rating && (
                                    <div className="flex flex-col items-end">
                                        <span className="text-xs text-slate-500 mb-1">Rate Visit:</span>
                                        <div className="flex gap-1">
                                            {[1,2,3,4,5].map(star => (
                                                <button key={star} onClick={() => handleRating(apt.id, star)} className="hover:scale-110 transition-transform">
                                                    <Star size={20} className="text-slate-300 hover:text-yellow-400 fill-transparent hover:fill-yellow-400" />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                
                                {apt.rating && (
                                    <div className="flex gap-1">
                                        {[...Array(5)].map((_, i) => (
                                            <Star key={i} size={16} className={i < apt.rating ? "text-yellow-400 fill-yellow-400" : "text-slate-300"} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
};

const PatientManager = ({ user }: any) => {
    const [patients, setPatients] = useState<any[]>([]);
    const [selectedPatient, setSelectedPatient] = useState<any>(null);

    useEffect(() => {
        const q = query(getPublicCollection('users'));
        const unsub = onSnapshot(q, (snapshot: any) => {
            const data = snapshot.docs.map((d: any) => ({id: d.id, ...d.data()})).filter((u: any) => u.role === 'patient');
            setPatients(data);
        });
        return () => unsub();
    }, []);

    return (
        <div className="space-y-6">
            {selectedPatient ? (
                <div className="animate-fade-in-up">
                    <Button variant="secondary" onClick={() => setSelectedPatient(null)} className="mb-4"><ChevronRight className="rotate-180" size={16}/> Back to List</Button>
                    <UserProfile user={selectedPatient} isReadOnly={true} /> 
                </div>
            ) : (
                <Card title="Patient Registry">
                    <div className="overflow-x-auto max-h-[600px]">
                        <table className="w-full text-left">
                            <thead className="sticky top-0 bg-white dark:bg-slate-800 z-10 shadow-sm">
                                <tr className="text-slate-500 dark:text-slate-400 text-xs uppercase border-b border-slate-200 dark:border-slate-700">
                                    <th className="p-3">Swasthya ID</th>
                                    <th className="p-3">Name</th>
                                    <th className="p-3">Location</th>
                                    <th className="p-3">Details</th>
                                    <th className="p-3">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {patients.map(p => (
                                    <tr key={p.id} className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                        <td className="p-3 font-mono text-blue-600 dark:text-blue-400 font-bold">{p.swasthyaId || 'PENDING'}</td>
                                        <td className="p-3 font-medium dark:text-white">{p.name}</td>
                                        <td className="p-3 text-sm text-slate-500 dark:text-slate-400">{p.city || p.village}</td>
                                        <td className="p-3 text-sm text-slate-500 dark:text-slate-400">{p.age} yrs • {p.bloodGroup || 'UNK'}</td>
                                        <td className="p-3">
                                            <Button variant="outline" className="text-xs px-2 py-1" onClick={() => setSelectedPatient(p)}>View Profile</Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </div>
    );
};

const LiveMap = () => {
    return (
        <Card title="Live Tracking Map" className="h-full">
            <div className="w-full h-[400px] rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 relative">
                <iframe 
                    width="100%" 
                    height="100%" 
                    frameBorder="0" 
                    scrolling="no" 
                    marginHeight={0} 
                    marginWidth={0} 
                    src="https://www.openstreetmap.org/export/embed.html?bbox=75.75,26.85,75.85,26.95&amp;layer=mapnik" 
                    title="Jaipur Live Map"
                ></iframe>
                <div className="absolute top-4 right-4 bg-white dark:bg-slate-900 p-2 rounded shadow-lg text-xs opacity-90">
                    <div className="flex items-center gap-2 mb-1"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span> Emergency</div>
                    <div className="flex items-center gap-2 dark:text-white"><span className="w-2 h-2 rounded-full bg-green-500"></span> Active PHC</div>
                </div>
            </div>
        </Card>
    );
};

const UserProfile = ({ user, isReadOnly = false }: any) => {
  const [history, setHistory] = useState<any[]>([]);
  const [treatments, setTreatments] = useState<any[]>([]);
  const [newRecord, setNewRecord] = useState({ condition: '', medication: '', date: '' });
  const [showAddRecord, setShowAddRecord] = useState(false);
  const [newTreatment, setNewTreatment] = useState({ name: '', dosage: '' });
  const [showAddTreatment, setShowAddTreatment] = useState(false);

  useEffect(() => {
      if (!user.uid) return;
      
      const qHistory = query(getPublicCollection('patient_history'), where('userId', '==', user.uid));
      const unsubHistory = onSnapshot(qHistory, (snapshot: any) => {
          setHistory(snapshot.docs.map((d: any) => ({id: d.id, ...d.data()})));
      });

      const qTreatments = query(getPublicCollection('patient_treatments'), where('userId', '==', user.uid));
      const unsubTreatments = onSnapshot(qTreatments, (snapshot: any) => {
          setTreatments(snapshot.docs.map((d: any) => ({id: d.id, ...d.data()})));
      });

      return () => { unsubHistory(); unsubTreatments(); };
  }, [user.uid]);

  const handleAddRecord = async () => {
      if (!newRecord.condition) return;
      await addDoc(getPublicCollection('patient_history'), {
          userId: user.uid,
          condition: newRecord.condition,
          medication: newRecord.medication,
          date: newRecord.date || new Date().toISOString().split('T')[0],
          timestamp: serverTimestamp()
      });
      setNewRecord({ condition: '', medication: '', date: '' });
      setShowAddRecord(false);
  };

  const handleAddTreatment = async () => {
      if (!newTreatment.name) return;
      await addDoc(getPublicCollection('patient_treatments'), {
          userId: user.uid,
          name: newTreatment.name,
          dosage: newTreatment.dosage,
          timestamp: serverTimestamp()
      });
      setNewTreatment({ name: '', dosage: '' });
      setShowAddTreatment(false);
  };

  return (
    <div className="space-y-6">
       <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex flex-col md:flex-row items-center gap-6">
             <div className="w-24 h-24 rounded-full bg-white/20 border-4 border-white/30 flex items-center justify-center text-4xl font-bold">
                {user.name.charAt(0)}
             </div>
             <div className="flex-1 text-center md:text-left">
                <h2 className="text-3xl font-bold">{user.name}</h2>
                <div className="opacity-90 flex flex-col items-center md:items-start mt-2 space-y-1">
                   <span className="flex items-center gap-2"><MapPin size={16} /> {user.address || user.village}, {user.city || ''}</span>
                   {user.locationStatus === 'Captured' && (
                       <span className="text-xs bg-green-500/20 px-2 py-1 rounded flex items-center gap-1">
                          <MapPin size={12} /> GPS Verified
                       </span>
                   )}
                </div>
                <div className="mt-4 flex flex-wrap justify-center md:justify-start gap-3">
                   <span className="px-3 py-1 bg-white/20 rounded-full text-sm backdrop-blur-sm">Swasthya ID: {user.swasthyaId || 'PENDING'}</span>
                   <span className="px-3 py-1 bg-white/20 rounded-full text-sm backdrop-blur-sm">Age: {user.age || 'N/A'}</span>
                   <span className="px-3 py-1 bg-white/20 rounded-full text-sm backdrop-blur-sm flex items-center gap-1"><Droplet size={12} fill="white" /> Blood: {user.bloodGroup || 'Unknown'}</span>
                </div>
             </div>
          </div>
       </div>

       <div className="grid md:grid-cols-2 gap-6">
          <Card title="Medical History" action={!isReadOnly && <Button className="text-xs" onClick={() => setShowAddRecord(!showAddRecord)}>{showAddRecord ? 'Cancel' : 'Add Record'}</Button>}>
             {showAddRecord && (
                 <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800 animate-fade-in">
                     <input className="w-full p-2 mb-2 rounded border text-sm bg-white dark:bg-slate-700 dark:text-white dark:border-slate-600" placeholder="Condition (e.g. Typhoid)" value={newRecord.condition} onChange={e => setNewRecord({...newRecord, condition: e.target.value})} />
                     <input className="w-full p-2 mb-2 rounded border text-sm bg-white dark:bg-slate-700 dark:text-white dark:border-slate-600" placeholder="Details/Medication" value={newRecord.medication} onChange={e => setNewRecord({...newRecord, medication: e.target.value})} />
                     <input className="w-full p-2 mb-2 rounded border text-sm bg-white dark:bg-slate-700 dark:text-white dark:border-slate-600" type="date" value={newRecord.date} onChange={e => setNewRecord({...newRecord, date: e.target.value})} />
                     <Button className="w-full text-xs" onClick={handleAddRecord}>Save Record</Button>
                 </div>
             )}
             
             {history.length > 0 ? (
               <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {history.map((r, i) => (
                    <div key={i} className="p-3 border-l-4 border-blue-500 bg-slate-50 dark:bg-slate-900/50 rounded-r-lg">
                       <div className="font-semibold text-black dark:text-white">{r.condition}</div>
                       <div className="text-sm text-black dark:text-white opacity-80">{r.medication}</div>
                       <div className="text-xs text-black dark:text-white opacity-60 flex justify-between mt-1">
                          <span>{r.date}</span>
                       </div>
                    </div>
                  ))}
               </div>
             ) : (
               <div className="text-center py-8 text-slate-500">No medical records found.</div>
             )}
          </Card>
          
          <Card title="Active Treatments" action={!isReadOnly && <Button className="text-xs" onClick={() => setShowAddTreatment(!showAddTreatment)}>{showAddTreatment ? 'Cancel' : 'Add'}</Button>}>
             {showAddTreatment && (
                 <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-800 animate-fade-in">
                     <input className="w-full p-2 mb-2 rounded border text-sm bg-white dark:bg-slate-700 dark:text-white dark:border-slate-600" placeholder="Medication Name" value={newTreatment.name} onChange={e => setNewTreatment({...newTreatment, name: e.target.value})} />
                     <input className="w-full p-2 mb-2 rounded border text-sm bg-white dark:bg-slate-700 dark:text-white dark:border-slate-600" placeholder="Dosage (e.g. 1 Tablet Morning)" value={newTreatment.dosage} onChange={e => setNewTreatment({...newTreatment, dosage: e.target.value})} />
                     <Button className="w-full text-xs" onClick={handleAddTreatment}>Save Medication</Button>
                 </div>
             )}

             {treatments.length > 0 ? (
                <div className="space-y-2">
                    {treatments.map((t, i) => (
                        <div key={i} className="p-3 bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-100 dark:border-green-900/30">
                            <h4 className="font-semibold text-green-800 dark:text-green-400">{t.name}</h4>
                            <p className="text-sm text-slate-700 dark:text-slate-300">{t.dosage}</p>
                        </div>
                    ))}
                </div>
             ) : (
                <div className="text-center py-8 text-slate-500">No active medications listed.</div>
             )}
          </Card>
       </div>
    </div>
  );
};

const MedicalSimplifier = ({ t }: any) => {
    const [input, setInput] = useState('');
    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);
  
    const handleSimplify = async () => {
      if (!input.trim()) return;
      setLoading(true);
      const systemPrompt = `Translate medical term to simple English and Hindi for rural patients. JSON: {"simplified_english": "", "simplified_hindi": "", "action_item": ""}`;
      try {
        const response = await callGeminiAPI(input, systemPrompt);
        setResult(response);
      } catch (e) { setResult({simplified_english: "Error", simplified_hindi: "Error", action_item: "Retry"}); }
      setLoading(false);
    };
  
    return (
      <Card title="Medical Simplifier">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Enter medical term..." className="w-full p-3 rounded-lg bg-slate-50 dark:bg-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 mb-3" rows={3} />
        <Button variant="gemini" onClick={handleSimplify} disabled={loading} className="w-full">{loading ? 'Analyzing...' : 'Simplify'}</Button>
        {result && !result.error && (
           <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-800 animate-fade-in-up">
              <h4 className="font-bold text-purple-600 text-xs uppercase">English</h4>
              <p className="text-sm mb-2 dark:text-slate-300">{result.simplified_english}</p>
              <h4 className="font-bold text-purple-600 text-xs uppercase">Hindi</h4>
              <p className="text-sm mb-2 dark:text-slate-300">{result.simplified_hindi}</p>
              <div className="bg-white dark:bg-slate-800 p-2 rounded text-sm font-medium dark:text-white"><CheckCircle size={14} className="inline mr-1 text-green-500"/> {result.action_item}</div>
           </div>
        )}
      </Card>
    );
};

const DietPlanner = () => {
    const [condition, setCondition] = useState('');
    const [foodImage, setFoodImage] = useState<string|null>(null);
    const [plan, setPlan] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: any) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setFoodImage(reader.result as string); 
            };
            reader.readAsDataURL(file);
        }
    };
  
    const generatePlan = async () => {
      if (!condition.trim() && !foodImage) return;
      setLoading(true);
      
      let prompt = condition;
      let systemPrompt = `
        You are an expert nutritionist for rural India.
        Create a simple, low-cost 1-day meal plan based on the user's condition.
        Use local Indian ingredients.
        Output JSON: { "breakfast": "", "lunch": "", "dinner": "", "tip": "" }
      `;

      if (foodImage) {
          prompt = "Analyze this food image.";
          systemPrompt = `
            You are a nutritionist. Analyze the food in the image.
            Output JSON: { 
                "breakfast": "Estimated calories in this meal", 
                "lunch": "Nutritional value (Protein/Carbs)", 
                "dinner": "Is this healthy? (Yes/No & Why)", 
                "tip": "Suggestion to make this meal healthier" 
            }
          `;
      }

      try {
        const response = await callGeminiAPI(prompt, systemPrompt, foodImage);
        if (!response.error) setPlan(response);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    };
  
    return (
      <Card title="✨ AI Dietician & Food Analyzer">
        <div className="space-y-4">
           <p className="text-sm text-slate-500">Get a meal plan OR upload a photo of food to analyze it.</p>
           
           <div className="flex gap-2">
                <button onClick={() => fileInputRef.current?.click()} className="p-3 border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-center dark:border-slate-600">
                    <Camera size={20} className="text-slate-500 dark:text-slate-300"/>
                </button>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                
                <input 
                    type="text" 
                    value={condition} 
                    onChange={(e) => setCondition(e.target.value)} 
                    placeholder={foodImage ? "Image selected! Click Generate." : "E.g. I have anemia..."} 
                    className="flex-1 p-2 bg-slate-50 dark:bg-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg"
                    disabled={!!foodImage}
                />
                <Button variant="gemini" onClick={generatePlan} disabled={loading}>{loading ? 'Analyzing...' : 'Generate'}</Button>
           </div>

           {foodImage && (
               <div className="relative h-20 w-20 bg-slate-100 rounded overflow-hidden">
                   <img src={foodImage} className="w-full h-full object-cover" alt="food" />
                   <button onClick={() => { setFoodImage(null); setCondition(''); }} className="absolute top-0 right-0 bg-red-500 text-white p-1 rounded-bl"><X size={12}/></button>
               </div>
           )}

           {plan && (
             <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-xl border border-orange-100 dark:border-orange-800 animate-fade-in-up">
                <div className="grid gap-4">
                   <div className="flex items-start gap-3">
                      <Coffee className="text-orange-500 mt-1" size={18} />
                      <div>
                        <h4 className="font-bold text-orange-700 dark:text-orange-400 text-xs uppercase">{foodImage ? 'Calories' : 'Breakfast'}</h4>
                        <p className="text-sm dark:text-slate-300">{plan.breakfast}</p>
                      </div>
                   </div>
                   <div className="flex items-start gap-3">
                      <Utensils className="text-orange-500 mt-1" size={18} />
                      <div>
                        <h4 className="font-bold text-orange-700 dark:text-orange-400 text-xs uppercase">{foodImage ? 'Nutrition' : 'Lunch'}</h4>
                        <p className="text-sm dark:text-slate-300">{plan.lunch}</p>
                      </div>
                   </div>
                   <div className="flex items-start gap-3">
                      <Utensils className="text-orange-500 mt-1" size={18} />
                      <div>
                        <h4 className="font-bold text-orange-700 dark:text-orange-400 text-xs uppercase">{foodImage ? 'Verdict' : 'Dinner'}</h4>
                        <p className="text-sm dark:text-slate-300">{plan.dinner}</p>
                      </div>
                   </div>
                </div>
                <div className="mt-4 pt-3 border-t border-orange-200 dark:border-orange-800 text-xs text-orange-800 dark:text-orange-300 font-medium">
                    💡 Tip: {plan.tip}
                </div>
             </div>
           )}
        </div>
      </Card>
    );
};

const PrescriptionHelper = () => {
    const [shorthand, setShorthand] = useState('');
    const [instructions, setInstructions] = useState<any[]|null>(null);
    const [loading, setLoading] = useState(false);
  
    const formatRx = async () => {
      if (!shorthand.trim()) return;
      setLoading(true);
      const systemPrompt = `
        You are a medical assistant. Convert doctor's shorthand into clear patient instructions.
        Input: Medical shorthand (e.g., "PCM 500 TDS 3d").
        Output JSON: { "instructions": [ { "medicine": "Paracetamol 500mg", "dosage": "1 tablet", "timing": "3 times a day", "hindi_instruction": "दिन में 3 बार 1 गोली लें" } ] }
      `;
      try {
        const response = await callGeminiAPI(shorthand, systemPrompt);
        if (!response.error) setInstructions(response.instructions);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    };
  
    return (
      <Card title="✨ Smart Prescription Formatter">
        <div className="space-y-4">
           <p className="text-sm text-slate-500">Convert medical shorthand notes into clear, printable patient instructions in English & Hindi.</p>
           <textarea 
             className="w-full p-3 bg-slate-50 dark:bg-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
             rows={2}
             placeholder='Enter notes (e.g., "Amox 500 BD 5 days, PCM SOS")'
             value={shorthand}
             onChange={(e) => setShorthand(e.target.value)}
           />
           <Button variant="gemini" onClick={formatRx} disabled={loading} className="w-full">
              {loading ? 'Formatting...' : 'Generate Patient Instructions'}
           </Button>
           
           {instructions && (
              <div className="space-y-2 mt-4 animate-fade-in-up">
                 {instructions.map((ins, i) => (
                    <div key={i} className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
                       <div className="flex justify-between font-bold text-blue-800 dark:text-blue-300 text-sm">
                          <span>{ins.medicine}</span>
                          <span>{ins.timing}</span>
                       </div>
                       <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{ins.dosage}</p>
                       <p className="text-sm text-blue-600 dark:text-blue-400 font-hindi mt-1 border-t border-blue-200 dark:border-blue-800 pt-1">
                          {ins.hindi_instruction}
                       </p>
                    </div>
                 ))}
              </div>
           )}
        </div>
      </Card>
    );
};

const DrugInteractionChecker = () => {
    const [meds, setMeds] = useState('');
    const [analysis, setAnalysis] = useState<any>(null);
    const [loading, setLoading] = useState(false);
  
    const checkInteractions = async () => {
      if (!meds.trim()) return;
      setLoading(true);
      const systemPrompt = `
        You are a drug safety expert. Analyze the list of medicines for potential interactions.
        Output JSON: { "status": "Safe" | "Caution" | "Danger", "message": "English explanation", "hindi_message": "Hindi explanation" }
      `;
      try {
        const response = await callGeminiAPI(meds, systemPrompt);
        if (!response.error) setAnalysis(response);
        else setAnalysis({ status: "Caution", message: "AI Service Unavailable", hindi_message: "सेवा अनुपलब्ध" });
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    };
  
    return (
      <Card title="✨ Safety Shield: Interaction Checker">
         <div className="space-y-4">
            <p className="text-sm text-slate-500">Enter multiple medicines (up to 50+) to check safety.</p>
            <textarea 
               className="w-full p-3 bg-slate-50 dark:bg-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
               rows={6}
               placeholder='E.g., "Aspirin, Warfarin, Ibuprofen, Paracetamol, Metformin..."'
               value={meds}
               onChange={(e) => setMeds(e.target.value)}
            />
            <Button variant="gemini" onClick={checkInteractions} disabled={loading} className="w-full">
               {loading ? 'Checking Safety...' : 'Check Interactions'}
            </Button>
 
            {analysis && (
               <div className={`mt-4 p-4 rounded-xl border animate-fade-in-up ${
                  analysis.status === 'Safe' ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300' :
                  analysis.status === 'Danger' ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300' :
                  'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-300'
               }`}>
                  <div className="flex items-center gap-2 font-bold mb-2">
                     <ShieldCheck size={18} />
                     Status: {analysis.status.toUpperCase()}
                  </div>
                  <p className="text-sm mb-2">{analysis.message}</p>
                  <p className="text-sm font-hindi opacity-90">{analysis.hindi_message}</p>
               </div>
            )}
         </div>
      </Card>
    );
};

const LabReportAnalyzer = () => {
    const [reportText, setReportText] = useState('');
    const [imageFile, setImageFile] = useState<string|null>(null);
    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: any) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setImageFile(reader.result as string); 
            };
            reader.readAsDataURL(file);
        }
    };

    const analyzeReport = async () => {
        if (!reportText.trim() && !imageFile) return;
        setLoading(true);
        let prompt = reportText;
        if (imageFile) prompt = "Analyze this medical lab report image. Extract key values and explain them.";
        const systemPrompt = `
           You are a helpful doctor assistant. 
           Analyze the lab report (text or image). 
           Output JSON: { 
             "summary": "Simple English summary of findings", 
             "hindi_summary": "Simple Hindi summary", 
             "flags": ["List of abnormal values with value"],
             "advice": "General health advice based on report"
           }
        `;
        try {
           const response = await callGeminiAPI(prompt, systemPrompt, imageFile);
           if (!response.error) setResult(response);
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    return (
       <Card title="✨ Lab Report Explainer">
          <div className="space-y-4">
             <p className="text-sm text-slate-500">Upload a photo or paste text.</p>
             <div className="flex gap-2">
                 <button onClick={() => fileInputRef.current?.click()} className="flex-1 p-4 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-blue-500 hover:bg-blue-50 dark:border-slate-600 dark:hover:bg-slate-700 transition-colors flex flex-col items-center gap-2">
                    <Upload size={24}/>
                    <span className="text-xs">{imageFile ? 'Image Loaded' : 'Upload Photo'}</span>
                 </button>
                 <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
             </div>
             {imageFile && (
                 <div className="relative h-20 w-full bg-slate-100 rounded overflow-hidden">
                     <img src={imageFile} className="w-full h-full object-cover opacity-50" alt="preview" />
                     <button onClick={() => setImageFile(null)} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1"><X size={12}/></button>
                 </div>
             )}
             <textarea className="w-full p-3 bg-slate-50 dark:bg-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg text-sm" rows={2} placeholder='e.g. "Hemoglobin 8.2"' value={reportText} onChange={(e) => setReportText(e.target.value)} />
             <Button variant="gemini" onClick={analyzeReport} disabled={loading} className="w-full">{loading ? 'Analyzing...' : 'Explain Report'}</Button>
             {result && (
                <div className="mt-4 space-y-3 animate-fade-in-up">
                   {result.flags?.length > 0 && <div className="flex flex-wrap gap-2">{result.flags.map((flag: string, i: number) => <span key={i} className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full font-bold">{flag}</span>)}</div>}
                   <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
                      <p className="text-sm mb-2 font-medium dark:text-white">{result.summary}</p>
                      <p className="text-sm font-hindi border-t pt-2 border-blue-200 dark:border-blue-800 dark:text-slate-300">{result.hindi_summary}</p>
                      <div className="mt-2 text-xs text-blue-600 dark:text-blue-300 bg-white/50 dark:bg-black/30 p-2 rounded">💡 {result.advice}</div>
                   </div>
                </div>
             )}
          </div>
       </Card>
    );
};

const HealthAssistant = () => {
    const [messages, setMessages] = useState([
      { id: 1, text: "Hello! I am your AI Health Assistant. Describe your symptoms.", sender: 'bot', type: 'system' },
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);
  
    useEffect(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);
  
    const handleSend = async () => {
      if (!input.trim()) return;
      const userMsg = { id: Date.now(), text: input, sender: 'user', type: 'text' };
      setMessages(prev => [...prev, userMsg]);
      setInput('');
      setIsTyping(true);
  
      const systemPrompt = `You are SwasthyaMitra. Analyze symptoms. Rules: 1. Determine Risk: 'Mild', 'Moderate', 'Emergency'. 2. Advice in BOTH English and Hindi. 3. Short concise. Output JSON: { "risk": "mild", "message": "advice" }`;
  
      try {
        const response = await callGeminiAPI(userMsg.text, systemPrompt);
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'bot',
          type: 'text',
          text: response.message || "Please consult a doctor."
        }]);
      } catch (error) {
        setMessages(prev => [...prev, { id: Date.now()+1, sender: 'bot', type: 'text', text: "Network Error." }]);
      }
      setIsTyping(false);
    };
  
    return (
      <div className="flex flex-col h-[500px] bg-white dark:bg-slate-800 rounded-xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-700">
        <div className="p-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex justify-between items-center">
          <div className="flex items-center gap-2"><Sparkles size={20} /><h3 className="font-semibold">AI Health Assistant</h3></div>
          <Badge type="info" text="Gemini AI" />
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-900/50">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${msg.type === 'system' ? 'bg-yellow-100 text-yellow-800 w-full text-center text-xs' : msg.sender === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-sm rounded-tl-none'}`}>{msg.text}</div>
            </div>
          ))}
          {isTyping && <div className="p-2 text-xs text-slate-400">AI is typing...</div>}
          <div ref={chatEndRef} />
        </div>
        <div className="p-3 bg-white dark:bg-slate-800 flex gap-2 border-t border-slate-100 dark:border-slate-700">
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder="Type symptoms..." className="flex-1 bg-slate-100 dark:bg-slate-900 dark:text-white rounded-full px-4" />
          <button onClick={handleSend} className="p-2 bg-blue-600 text-white rounded-full"><Send size={18} /></button>
        </div>
      </div>
    );
};

const Telemedicine = () => {
    const [doctors] = useState([
        { id: 1, name: 'Dr. Anjali Gupta', spec: 'General Physician', exp: '10 yrs', lang: 'Hindi, English', status: 'Online', phone: '8305300811' },
        { id: 2, name: 'Dr. Rajesh Koothrappali', spec: 'Pediatrician', exp: '8 yrs', lang: 'English', status: 'Offline', phone: '8305300811' },
        { id: 3, name: 'Dr. Sunita Williams', spec: 'Gynecologist', exp: '15 yrs', lang: 'Hindi, English', status: 'Online', phone: '8305300811' },
    ]);
    const [selectedDoc, setSelectedDoc] = useState<any>(null);
    const [inCall, setInCall] = useState(false);
  
    if (inCall) {
      return (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center text-white">
          <div className="w-full max-w-4xl aspect-video bg-slate-900 rounded-lg relative overflow-hidden border border-slate-700 shadow-2xl">
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="w-24 h-24 rounded-full bg-slate-700 mx-auto mb-4 border-4 border-green-500 overflow-hidden"><img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedDoc?.name}`} alt="avatar" /></div>
              <h2 className="text-2xl font-bold">{selectedDoc?.name}</h2>
              <p className="text-green-400 animate-pulse mb-6">● Live Connection</p>
              <div className="bg-slate-800/90 p-6 rounded-xl border border-slate-600 text-center backdrop-blur-md shadow-2xl max-w-sm mx-4">
                  <p className="text-slate-300 text-sm mb-3">Network unstable? Call directly:</p>
                  <a href={`tel:${selectedDoc?.phone}`} className="block w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-3"><Phone size={24} /> <span className="text-xl">Dial {selectedDoc?.phone}</span></a>
              </div>
            </div>
            <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-6">
               <button className="p-4 bg-red-600 rounded-full hover:bg-red-700 transition-colors" onClick={() => setInCall(false)}><Phone size={24} className="rotate-135" /></button>
            </div>
          </div>
        </div>
      );
    }
  
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold dark:text-white">Telemedicine Portal</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {doctors.map(doc => (
            <Card key={doc.id} className="hover:border-blue-500 transition-colors">
              <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center overflow-hidden"><img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${doc.name}`} alt="avatar" /></div>
                    <div><h3 className="font-semibold text-slate-800 dark:text-white">{doc.name}</h3><p className="text-xs text-slate-500">{doc.spec}</p></div>
                  </div>
                  <Badge type={doc.status === 'Online' ? 'success' : 'warning'} text={doc.status} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                  <Button variant="video" className="text-xs" onClick={() => { setSelectedDoc(doc); setInCall(true); }}><Video size={14} /> Call Now</Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
};

// --- APP ---

const App = () => {
  const [theme, setTheme] = useState('light');
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [notification, setNotification] = useState<any>(null);
  
  // Auth State
  const [patientAuthMode, setPatientAuthMode] = useState('menu'); 
  const [authError, setAuthError] = useState('');
  const [loadingLocation, setLoadingLocation] = useState(false);
  
  const [loginForm, setLoginForm] = useState({ identifier: '' });
  const [staffCode, setStaffCode] = useState('');
  const [ashaLoginForm, setAshaLoginForm] = useState({ name: '', city: '' });
  
  const [regForm, setRegForm] = useState({ 
    name: '', village: '', city: '', address: '',
    age: '', bloodGroup: 'O+', lat: null, lng: null, locationStatus: 'Not Captured' 
  });

  const t = {
    appTitle: 'SwasthyaMitra',
    dashboard: 'Dashboard',
    patients: 'Patients',
    inventory: 'Inventory',
    appointments: 'Appointments',
    labs: 'Lab Analyzer',
    chat: 'AI Assistant',
    diet: 'Diet Planner',
    map: 'Live Map',
    telemedicine: 'Telemedicine',
    rx: 'Rx Helper',
    logout: 'Logout'
  };

  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [theme]);

  // --- HANDLERS ---

  const handleLogout = () => {
      setUser(null);
      setPatientAuthMode('menu');
      setNotification({ type: 'success', message: 'Logged out successfully' });
  };

  const handlePatientLogin = async () => {
      setAuthError('');
      const { identifier } = loginForm;
      if(!identifier) { setAuthError('Enter ID'); return; }

      const q = query(getPublicCollection('users'));
      const snapshot = await getDocs(q);
      const users = snapshot.docs.map((d: any) => d.data());
      
      const foundUser = users.find((u: any) => u.swasthyaId === identifier || u.name.toLowerCase() === identifier.toLowerCase());

      if (foundUser) {
          setUser(foundUser);
          setPatientAuthMode('menu'); 
          setNotification({ type: 'success', message: `Welcome back, ${foundUser.name}` });
      } else {
          setAuthError("User not found.");
      }
  };

  const handleAshaLoginSubmit = async () => {
      if (staffCode !== 'ASHA2026') { setAuthError("Invalid Code"); return; }
      
      const q = query(getPublicCollection('users'), where('role', '==', 'asha'), where('name', '==', ashaLoginForm.name));
      const snapshot = await getDocs(q);
      
      let ashaUser = null;
      if (!snapshot.empty) {
          ashaUser = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
          setNotification({ type: 'success', message: `Welcome back, ${ashaUser.name}` });
      } else {
          const smId = 'SM' + Math.floor(1000 + Math.random() * 9000); // SMxxxx
          ashaUser = {
              name: ashaLoginForm.name,
              city: ashaLoginForm.city,
              role: 'asha',
              swasthyaId: smId,
              joinedAt: serverTimestamp(),
              uid: 'asha-' + Date.now()
          };
          await addDoc(getPublicCollection('users'), ashaUser);
          setNotification({ type: 'success', message: `Registered New ASHA: ${smId}` });
      }

      setUser(ashaUser);
  };

  const handleAdminLoginSubmit = () => {
      if (staffCode !== 'ADMIN2026') { setAuthError("Invalid Code"); return; }
      setUser({ role: 'admin', name: 'Dr. Sharma', uid: 'admin-1' });
      setNotification({ type: 'success', message: 'Admin Access Granted' });
  };

  const handleGetLocation = () => {
    if (navigator.geolocation) {
      setLoadingLocation(true);
      navigator.geolocation.getCurrentPosition(
        (position: any) => {
          setRegForm((prev: any) => ({
            ...prev,
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            locationStatus: 'Captured'
          }));
          setLoadingLocation(false);
        },
        (error) => {
          console.error("GPS Error:", error);
          setRegForm((prev: any) => ({...prev, locationStatus: 'Failed'}));
          setLoadingLocation(false);
          alert("Could not access location. Please allow permissions.");
        }
      );
    } else {
       alert("Geolocation is not supported by this browser.");
    }
  };

  const handleRegister = async () => {
      if(!regForm.name) return;
      const newUser = {
          swasthyaId: String(Math.floor(100000 + Math.random() * 900000)),
          name: regForm.name,
          village: regForm.village,
          city: regForm.city,
          address: regForm.address,
          age: regForm.age,
          bloodGroup: regForm.bloodGroup,
          lat: regForm.lat,
          lng: regForm.lng,
          locationStatus: regForm.locationStatus,
          role: 'patient',
          joinedAt: serverTimestamp(),
          uid: 'guest-' + Date.now()
      };
      await addDoc(getPublicCollection('users'), newUser);
      setUser(newUser);
      setPatientAuthMode('menu');
      setNotification({ type: 'success', message: `Registered! ID: ${newUser.swasthyaId}` });
  };

  const NavItem = ({ id, icon: Icon, label }: any) => (
    <button onClick={() => setActiveTab(id)} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === id ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 dark:text-slate-400'}`}>
       <Icon size={20} /> <span className="hidden md:block">{label}</span>
    </button>
  );

  // --- RENDER ---

  if (!user) {
    return (
       <div className={`min-h-screen flex flex-col items-center justify-center p-4 transition-colors ${theme === 'dark' ? 'dark bg-slate-900' : 'bg-slate-50'}`}>
          {notification && <Toast message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
          <SOSButton />
          
          <div className="absolute top-6 right-6 flex gap-2">
             <button onClick={() => setTheme(p => p === 'light' ? 'dark' : 'light')} className="p-2 bg-white dark:bg-slate-800 rounded-full shadow">{theme === 'light' ? <Moon size={18}/> : <Sun size={18} className="text-yellow-400" />}</button>
          </div>
          
          <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 animate-fade-in-up relative overflow-hidden">
             <div className="text-center mb-8">
                <div className="inline-flex p-3 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 mb-4"><Activity size={40} /></div>
                <h1 className="text-3xl font-bold dark:text-white">{t.appTitle}</h1>
                <p className="text-slate-500">Universal Healthcare Platform</p>
             </div>

             {patientAuthMode === 'menu' && (
                 <div className="space-y-4">
                    <Button variant="primary" className="w-full py-4 text-lg justify-between group" onClick={() => setPatientAuthMode('login_or_register')}>
                       <span className="flex items-center gap-3"><User /> Patient Portal</span> <ChevronRight/>
                    </Button>
                    
                    <div className="relative py-2">
                       <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-200 dark:border-slate-700"></span></div>
                       <div className="relative flex justify-center text-xs uppercase"><span className="bg-white dark:bg-slate-800 px-2 text-slate-500">Staff Access</span></div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                       <Button variant="outline" className="py-3 flex-col gap-1 h-24" onClick={() => { setPatientAuthMode('asha_login'); setAuthError(''); }}>
                          <Stethoscope className="text-green-500 mb-1"/><span className="text-xs">ASHA Worker</span>
                       </Button>
                       <Button variant="outline" className="py-3 flex-col gap-1 h-24" onClick={() => { setPatientAuthMode('admin_login'); setAuthError(''); }}>
                          <ShieldAlert className="text-purple-500 mb-1"/><span className="text-xs">Admin</span>
                       </Button>
                    </div>
                 </div>
             )}

             {/* Login Forms */}
             {patientAuthMode === 'asha_login' && (
                 <div className="space-y-4 animate-fade-in">
                    <button onClick={() => setPatientAuthMode('menu')} className="text-slate-400 hover:text-slate-600"><ArrowLeft /></button>
                    <input className="w-full p-3 bg-slate-50 dark:bg-slate-700 dark:text-white rounded" placeholder="Name" value={ashaLoginForm.name} onChange={e => setAshaLoginForm({...ashaLoginForm, name: e.target.value})} />
                    <input className="w-full p-3 bg-slate-50 dark:bg-slate-700 dark:text-white rounded" placeholder="City" value={ashaLoginForm.city} onChange={e => setAshaLoginForm({...ashaLoginForm, city: e.target.value})} />
                    <input type="password" className="w-full p-3 bg-slate-50 dark:bg-slate-700 dark:text-white rounded" placeholder="Code (ASHA2026)" value={staffCode} onChange={e => setStaffCode(e.target.value)} />
                    {authError && <div className="text-red-500 text-sm text-center">{authError}</div>}
                    <Button className="w-full mt-4" onClick={handleAshaLoginSubmit}>Login</Button>
                 </div>
             )}

             {patientAuthMode === 'admin_login' && (
                 <div className="space-y-4 animate-fade-in">
                    <button onClick={() => setPatientAuthMode('menu')} className="text-slate-400 hover:text-slate-600"><ArrowLeft /></button>
                    <input type="password" className="w-full p-3 bg-slate-50 dark:bg-slate-700 dark:text-white rounded" placeholder="Code (ADMIN2026)" value={staffCode} onChange={e => setStaffCode(e.target.value)} />
                    {authError && <div className="text-red-500 text-sm text-center">{authError}</div>}
                    <Button className="w-full mt-4" onClick={handleAdminLoginSubmit}>Login</Button>
                 </div>
             )}

             {patientAuthMode === 'login_or_register' && (
                 <div className="space-y-4 animate-fade-in">
                    <button onClick={() => setPatientAuthMode('menu')} className="text-slate-400 hover:text-slate-600"><ArrowLeft /></button>
                    <Button variant="outline" className="w-full py-4 justify-between" onClick={() => setPatientAuthMode('login')}>Existing User <ChevronRight/></Button>
                    <Button variant="primary" className="w-full py-4 justify-between" onClick={() => setPatientAuthMode('register')}>New User <ChevronRight/></Button>
                 </div>
             )}

             {patientAuthMode === 'login' && (
                 <div className="space-y-4 animate-fade-in">
                    <button onClick={() => setPatientAuthMode('login_or_register')} className="text-slate-400 hover:text-slate-600"><ArrowLeft /></button>
                    <input className="w-full p-3 bg-slate-50 dark:bg-slate-700 dark:text-white rounded" placeholder="Name or ID" value={loginForm.identifier} onChange={e => setLoginForm({...loginForm, identifier: e.target.value})} />
                    {authError && <div className="text-red-500 text-sm text-center">{authError}</div>}
                    <Button className="w-full mt-4" onClick={handlePatientLogin}>Login</Button>
                 </div>
             )}

             {patientAuthMode === 'register' && (
                 <div className="space-y-3 animate-fade-in max-h-[60vh] overflow-y-auto pr-1">
                    <button onClick={() => setPatientAuthMode('login_or_register')} className="text-slate-400 hover:text-slate-600"><ArrowLeft /></button>
                    <input className="w-full p-3 bg-slate-50 dark:bg-slate-700 dark:text-white rounded" value={regForm.name} onChange={e => setRegForm({...regForm, name: e.target.value})} placeholder="Full Name" />
                    <div className="grid grid-cols-2 gap-3">
                        <input className="p-3 bg-slate-50 dark:bg-slate-700 dark:text-white border-none rounded-lg" type="number" value={regForm.age} onChange={e => setRegForm({...regForm, age: e.target.value})} placeholder="Age" />
                        <select className="p-3 bg-slate-50 dark:bg-slate-700 dark:text-white border-none rounded-lg" value={regForm.bloodGroup} onChange={e => setRegForm({...regForm, bloodGroup: e.target.value})}>
                            <option>O+</option><option>O-</option>
                            <option>A+</option><option>A-</option>
                            <option>B+</option><option>B-</option>
                            <option>AB+</option><option>AB-</option>
                        </select>
                    </div>
                    <input className="w-full p-3 bg-slate-50 dark:bg-slate-700 dark:text-white border-none rounded-lg" value={regForm.village} onChange={e => setRegForm({...regForm, village: e.target.value})} placeholder="Village / Area" />
                    <input className="w-full p-3 bg-slate-50 dark:bg-slate-700 dark:text-white border-none rounded-lg" value={regForm.city} onChange={e => setRegForm({...regForm, city: e.target.value})} placeholder="City" />
                    <input className="w-full p-3 bg-slate-50 dark:bg-slate-700 dark:text-white border-none rounded-lg" value={regForm.address} onChange={e => setRegForm({...regForm, address: e.target.value})} placeholder="Full Address" />
                    
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg flex justify-between items-center">
                        <span className="text-xs text-slate-500">{regForm.locationStatus === 'Captured' ? '✅ GPS Captured' : '📍 Location needed'}</span>
                        <Button variant="secondary" className="text-xs py-1" onClick={handleGetLocation} disabled={loadingLocation}>
                            {loadingLocation ? '...' : 'Get GPS'}
                        </Button>
                    </div>
                    <Button className="w-full mt-2" onClick={handleRegister}>Create Account</Button>
                 </div>
             )}
          </div>
       </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col md:flex-row ${theme === 'dark' ? 'dark bg-slate-900 text-white' : 'bg-slate-50 text-slate-900'}`}>
       {notification && <Toast message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
       <SOSButton />
       
       <aside className="bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 w-full md:w-64 flex-shrink-0 z-20">
          <div className="p-4 flex items-center gap-2 border-b border-slate-100 dark:border-slate-700">
             <Activity className="text-blue-600"/> <span className="font-bold text-xl">{t.appTitle}</span>
          </div>
          <nav className="p-4 space-y-1">
             <NavItem id="dashboard" icon={Box} label={t.dashboard} />
             {user.role === 'patient' && <NavItem id="profile" icon={User} label="Profile" />}
             <NavItem id="appointments" icon={Calendar} label={t.appointments} />
             <NavItem id="inventory" icon={Package} label={t.inventory} />
             
             {/* Patient Only Features */}
             {user.role === 'patient' && (
                <>
                   <NavItem id="labs" icon={FlaskConical} label={t.labs} />
                   <NavItem id="diet" icon={Utensils} label={t.diet} />
                   <NavItem id="telemedicine" icon={Video} label={t.telemedicine} />
                </>
             )}

             <NavItem id="chat" icon={MessageSquare} label={t.chat} />
             <NavItem id="map" icon={Map} label={t.map} />
             
             {user.role !== 'patient' && <NavItem id="patients" icon={Users} label={t.patients} />}
             {user.role !== 'patient' && <NavItem id="rx" icon={FilePenLine} label={t.rx} />}
          </nav>
          <div className="mt-auto p-4 border-t border-slate-100 dark:border-slate-700">
             <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">{user.name[0]}</div>
                <div className="overflow-hidden">
                   <div className="font-medium truncate text-sm">{user.name}</div>
                   <div className="text-xs text-slate-500 capitalize">{user.role}</div>
                </div>
             </div>
             <Button variant="outline" className="w-full text-xs" onClick={handleLogout}><LogOut size={14}/> {t.logout}</Button>
          </div>
       </aside>

       <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-20">
          <header className="flex justify-between items-center mb-8">
             <div>
                <h2 className="text-2xl font-bold capitalize">{activeTab}</h2>
                <div className="text-xs text-slate-500">Live System • {user.role === 'asha' ? user.city : user.role}</div>
             </div>
             <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 shadow flex items-center justify-center">{theme === 'light' ? <Moon size={18}/> : <Sun size={18} className="text-yellow-400" />}</button>
          </header>

          <div className="space-y-6">
             {activeTab === 'dashboard' && user.role !== 'patient' && <CityManager user={user} setNotification={setNotification} />}
             {activeTab === 'dashboard' && user.role === 'patient' && (
                 <>
                    <DailyHealthTip user={user} />
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                        <Card onClick={() => setActiveTab('appointments')} className="hover:border-blue-500 cursor-pointer text-center py-10 transition-all hover:shadow-lg">
                            <Calendar size={48} className="mx-auto text-blue-500 mb-4"/> 
                            <span className="text-lg font-bold block">Book Doctor</span>
                            <span className="text-sm text-slate-500">Schedule Visit</span>
                        </Card>
                        <Card onClick={() => setActiveTab('labs')} className="hover:border-teal-500 cursor-pointer text-center py-10 transition-all hover:shadow-lg">
                            <FlaskConical size={48} className="mx-auto text-teal-500 mb-4"/> 
                            <span className="text-lg font-bold block">Lab Report</span>
                            <span className="text-sm text-slate-500">AI Analysis</span>
                        </Card>
                        <Card onClick={() => setActiveTab('chat')} className="hover:border-purple-500 cursor-pointer text-center py-10 transition-all hover:shadow-lg">
                            <Sparkles size={48} className="mx-auto text-purple-500 mb-4"/> 
                            <span className="text-lg font-bold block">AI Chat</span>
                            <span className="text-sm text-slate-500">Symptom Check</span>
                        </Card>
                        <Card onClick={() => setActiveTab('telemedicine')} className="hover:border-green-500 cursor-pointer text-center py-10 transition-all hover:shadow-lg">
                            <Video size={48} className="mx-auto text-green-500 mb-4"/> 
                            <span className="text-lg font-bold block">Call Doctor</span>
                            <span className="text-sm text-slate-500">Video Consult</span>
                        </Card>
                        <Card onClick={() => setActiveTab('profile')} className="hover:border-orange-500 cursor-pointer text-center py-10 transition-all hover:shadow-lg">
                            <Clipboard size={48} className="mx-auto text-orange-500 mb-4"/> 
                            <span className="text-lg font-bold block">My Records</span>
                            <span className="text-sm text-slate-500">History & Prescriptions</span>
                        </Card>
                        <Card onClick={() => setActiveTab('map')} className="hover:border-red-500 cursor-pointer text-center py-10 transition-all hover:shadow-lg">
                            <MapPin size={48} className="mx-auto text-red-500 mb-4"/> 
                            <span className="text-lg font-bold block">Find Center</span>
                            <span className="text-sm text-slate-500">Maps & Directions</span>
                        </Card>
                    </div>
                 </>
             )}

             {activeTab === 'inventory' && <InventoryManager user={user} setNotification={setNotification} />}
             {activeTab === 'appointments' && <AppointmentManager user={user} setNotification={setNotification} />}
             {activeTab === 'labs' && <LabReportAnalyzer />}
             {activeTab === 'patients' && <PatientManager user={user} />}
             {activeTab === 'profile' && <UserProfile user={user} />}
             {activeTab === 'chat' && (
                 <div className="grid md:grid-cols-2 gap-6">
                    <HealthAssistant />
                    {user.role === 'asha' && <MedicalSimplifier t={t} />}
                 </div>
             )}
             {activeTab === 'diet' && <DietPlanner />}
             {activeTab === 'map' && <LiveMap />}
             {activeTab === 'telemedicine' && <Telemedicine />}
             {activeTab === 'rx' && (
                 <div className="grid md:grid-cols-2 gap-6">
                    <PrescriptionHelper />
                    <DrugInteractionChecker />
                 </div>
             )}
          </div>
       </main>
    </div>
  );
};

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<App />);
}