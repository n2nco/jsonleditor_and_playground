import React, { useState, useEffect, useRef } from 'react'; 
import { X, Plus, Save, RotateCcw, GripVertical, Trash2, Copy, Maximize2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const d = { 
  b: { temperature: 0.5, max_tokens: 500, top_p: 1, stream: false, api_key: '', proxy_url: '', kwargs: { logit_bias: {}, presence_penalty: 0, frequency_penalty: 0 }},
  o: { provider: 'openai', model: 'gpt-3.5-turbo' }, 
  a: { provider: 'azure', deployment_name: 'gpt-35-turbo-0125-____', endpoint: 'https://____.openai.azure.com/', api_key: "your_azure_key", api_version: '2024-02-15-preview' },
  r: { provider: 'openrouter', model: 'openai/gpt-4o', api_key: 'your_openrouter_api_key', endpoint: 'https://api.openrouter.ai/v1/chat/completions'},
  c: { provider: 'custom', model: 'your_special_model'}
};

const M = ({c,t}) => <DialogContent className="bg-gray-800 text-gray-100 p-4"><DialogTitle>{t}</DialogTitle>{c}</DialogContent>,
B = p => <Button variant="ghost" size="sm" {...p}/>;

const ResponseModal = ({content, onSave}) => {
  const [editedContent, setEditedContent] = useState(content);
  
  return (
    <DialogContent className="bg-gray-800 text-gray-100 p-4 max-w-4xl w-[90vw]">
      <DialogTitle>Response</DialogTitle>
      <textarea 
        value={editedContent} 
        onChange={e => setEditedContent(e.target.value)}
        className="w-full bg-gray-800/50 text-sm p-2 rounded resize-none h-[70vh] mt-4"
      />
      <div className="mt-4 flex justify-end">
        <B onClick={() => onSave(editedContent)}>Save <Save className="ml-2 h-4 w-4"/></B>
      </div>
    </DialogContent>
  );
};

const CopyPanelContent = ({panels, onCopy}) => {
  const [selectedPanel, setSelectedPanel] = useState("1");
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      onCopy(parseInt(selectedPanel)-1);
    }
  };

  return (
    <div className="space-y-4 mt-4">
      <Select value={selectedPanel} onValueChange={setSelectedPanel}>
        <SelectTrigger className="bg-gray-800 text-gray-100" onKeyDown={handleKeyDown}>
          <SelectValue placeholder="Panel 1"/>
        </SelectTrigger>
        <SelectContent className="bg-gray-800 border-gray-700">
          {panels.map((_,i)=><SelectItem key={i} value={String(i+1)} className="text-gray-100">Panel {i+1}</SelectItem>)}
        </SelectContent>
      </Select>
      <div className="flex justify-end">
        <B onClick={() => onCopy(parseInt(selectedPanel)-1)}>Add Panel</B>
      </div>
    </div>
  );
};

const ModelPlayground = () => {
  const [cfgs, setCfgs] = useState({'default-openai': {...d.b, ...d.o}, 'default-azure': {...d.b, ...d.a}, 'default-openrouter': {...d.b, ...d.r}}),
  [cur, setCur] = useState({...d.b, ...d.o}), 
  [curText, setCurText] = useState(JSON.stringify({...d.b, ...d.o}, null, 2)),
  [name, setName] = useState('default-openai'),
  [panels, setPanels] = useState([{id: 1, configName: 'default-openai', messages: [{role: 'system', content: 'You are a helpful assistant.'}], response: ''}]),
  [err, setErr] = useState(''), 
  [drag, setDrag] = useState(null), 
  [modal, setModal] = useState({t:'',c:''}), 
  [timing, setTiming] = useState({}),
  [referrer, setReferrer] = useState(null);

  const ref = useRef();

  useEffect(() => {
    const storedCfgs = JSON.parse(localStorage.getItem('cfgs') || '{}');
    const storedPanels = JSON.parse(localStorage.getItem('panels') || '[]');
    if (Object.keys(storedCfgs).length) setCfgs(prev => ({ ...prev, ...storedCfgs }));
    if (storedPanels.length) setPanels(storedPanels);
  }, []);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const referrerUrl = urlParams.get('referrer');
    const jsonlData = urlParams.get('jsonlData');

    setReferrer(referrerUrl);
    if (jsonlData) {
      try {
        const parsedMessages = JSON.parse(decodeURIComponent(jsonlData));
        setPanels([{ id: Date.now(), configName: 'default-openai', messages: parsedMessages, response: '' }]);
      } catch (error) {
        console.error('Error parsing JSONL data:', error);
      }
    }
  }, []);

  const save = (k,v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch{} },
  parseMsg = t => { try { const d = JSON.parse(t); return d.messages||[d]; } catch { throw new Error('Invalid JSON'); }},
  upd = (i,u) => { 
    setPanels(prevPanels => {
      const n = prevPanels.map((p,x) => x===i ? {...p, ...u} : p);
      save('panels',n);
      return n;
    });
  },
  saveConfig = () => {
    try {
      const parsed = JSON.parse(curText);
      setCur(parsed);
      setCfgs(p => ({...p, [name]: parsed}));
      save('cfgs', {...cfgs, [name]: parsed});
      setErr('');
    } catch(e) {
      setErr('Invalid JSON - cannot save');
    }
  };

  const call = async (p, i) => {
    const c = { ...cfgs[p.configName] };
    if (!c?.api_key) return upd(i, { response: 'Need API key' });

    const startTime = Date.now();
    let firstTokenTime;
    upd(i, { isLoading: true, response: '' });

    try {
        const baseUrl = c.proxy_url || 
            (c.provider === 'azure' 
                ? `${c.endpoint}/openai/deployments/${c.deployment_name}`
                : c.provider === 'openrouter' 
                ? c.endpoint
                : 'https://api.openai.com');

        const headers = {
            'Content-Type': 'application/json',
            ...(c.provider === 'azure' ? { 'api-key': c.api_key } : { 'Authorization': `Bearer ${c.api_key}` })
        };

        const endpointPath = c.provider === 'azure' 
            ? `/chat/completions?api-version=${c.api_version}`
            : c.provider === 'openrouter' 
            ? '' 
            : '/v1/chat/completions';

        const body = {
            messages: p.messages,
            model: c.provider === 'azure' || c.provider === 'openrouter' ? undefined : c.model,
            temperature: c.temperature,
            max_tokens: c.max_tokens,
            stream: c.stream,
            ...c.kwargs
        };

        const response = await fetch(baseUrl + endpointPath, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'API call failed');
        }

        if (c.stream) {
            const reader = response.body?.getReader();
            let text = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const lines = new TextDecoder().decode(value).split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') break;

                        try {
                            const content = JSON.parse(data).choices[0]?.delta?.content || '';
                            if (!firstTokenTime && content) {
                                firstTokenTime = Date.now();
                                setTiming(t => ({
                                    ...t, [i]: { latency: firstTokenTime - startTime }
                                }));
                            }
                            text += content;
                            upd(i, { response: text, isLoading: true });
                        } catch (err) {
                            console.error('Error parsing stream data:', err);
                        }
                    }
                }
            }
            const endTime = Date.now();
            setTiming(t => ({
                ...t, [i]: { ...t[i], total: endTime - startTime }
            }));
            upd(i, { response: text, isLoading: false });
        } else {
            const data = await response.json();
            const responseText = data.choices[0].message.content;
            const endTime = Date.now();
            setTiming(t => ({
                ...t, [i]: { latency: endTime - startTime, total: endTime - startTime }
            }));
            upd(i, { response: responseText, isLoading: false });
        }
    } catch (e) {
        console.error('API Error:', e);
        upd(i, { response: `Error: ${e.message}`, isLoading: false });
    }
  };

  const [panelDrag, setPanelDrag] = useState(null);
  const [panelWidths, setPanelWidths] = useState({});

  const handlePanelDragStart = (e, index) => {
    setPanelDrag(index);
    e.currentTarget.style.opacity = '0.5';
  };

  const handlePanelDragEnd = (e) => {
    e.currentTarget.style.opacity = '1';
    setPanelDrag(null);
  };

  const handlePanelDrop = (dropIndex) => {
    if (panelDrag === null) return;
    
    const newPanels = [...panels];
    const [movedPanel] = newPanels.splice(panelDrag, 1);
    newPanels.splice(dropIndex, 0, movedPanel);
    
    setPanels(newPanels);
    save('panels', newPanels);
  };

  const Dlg = ({t,c,o}) => <Dialog><DialogTrigger asChild>{t}</DialogTrigger><M t={o} c={c}/></Dialog>;
  return (
    <div className="h-screen bg-gray-900 text-gray-100 flex flex-col">
      <div className="flex flex-1 min-h-0">
        {/* Left Sidebar */}
        <div className="w-96 flex flex-col border-r border-gray-700">
          {/* Config Section */}
          <div className="p-4 flex-1 flex flex-col">
            <div className="flex justify-between">
              <Select value={name} onValueChange={v=>{setName(v);setCur(cfgs[v]);setCurText(JSON.stringify(cfgs[v],null,2));setErr('');}}>
                <SelectTrigger className="w-64 text-gray-100 bg-gray-800 text-left">
                  <SelectValue className="text-left truncate"/>
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  {Object.keys(cfgs).map(n=><SelectItem key={n} value={n} className="text-gray-100">{n}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1">
                <Dlg t={<B><Plus className="h-3 w-3"/></B>} o="New Config" c={<form onSubmit={(e)=>{
                  e.preventDefault();
                  const n=document.getElementById('n').value; 
                  if(!n||cfgs[n])return;
                  const nc={...d.b,...d.o}; 
                  setCfgs(p=>({...p,[n]:nc})); 
                  setName(n); 
                  setCur(nc);
                  setCurText(JSON.stringify(nc,null,2));
                  setModal({t:'',c:''});
                }} className="flex gap-2 mt-4">
                  <input placeholder="Name" className="flex-1 bg-gray-900 p-2 rounded" id="n"/>
                  <button type="submit"><Plus className="h-4 w-4"/></button>
                </form>}/>
                <B onClick={()=>{
                  const nc = cur.provider==='azure'?{...d.b,...d.a}:{...d.b,...d.o};
                  setCur(nc);
                  setCurText(JSON.stringify(nc,null,2));
                }}><RotateCcw className="h-4 w-4"/></B>
                <B onClick={saveConfig}><Save className="h-4 w-4"/></B>
              </div>
            </div>

            <textarea 
              value={curText} 
              onChange={e=>{
                setCurText(e.target.value);
                try { JSON.parse(e.target.value); setErr(''); } catch {}
              }}
              onKeyDown={e => {
                if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  saveConfig();
                }
              }}
              className={`h-[300px] w-full font-mono text-xs bg-gray-800/50 p-2 rounded border mt-4 ${err?'border-red-500':'border-gray-700'}`}
            />
            {err && <div className="text-xs text-red-500">{err}</div>}
          </div>

          {/* Home Button */}
          {referrer && (
            <div className="p-2 border-t border-gray-800">
              <Button 
                onClick={() => window.location.href = referrer} 
                variant="ghost" 
                className="text-gray-400 hover:text-gray-300 text-sm flex items-center gap-1 h-7"
              >
                <ArrowLeft className="h-3 w-3"/>
                Back
              </Button>
            </div>
          )}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-x-auto">
            <div className="flex flex-row h-full w-full">
              {panels.map((p,i) => (
                <div
                  key={p.id}
                  className="panel relative flex flex-col h-full"
                  style={{ 
                    flex: panelWidths[i] ? `0 0 ${panelWidths[i]}px` : '1 1 0%',
                    minWidth: '320px',
                    maxWidth: '2400px',
                    opacity: panelDrag === i ? 0.5 : 1 
                  }}
                  draggable
                  onDragStart={(e) => handlePanelDragStart(e, i)}
                  onDragEnd={handlePanelDragEnd}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handlePanelDrop(i);
                  }}
                >
                  <div className="h-full flex flex-col p-2 border-r border-gray-800">
                    <div className="flex gap-2 mb-2">
                      <span className="text-xs text-gray-400 cursor-move">P{i+1}</span>
                      <Select value={p.configName} onValueChange={v=>upd(i,{configName:v})}>
                        <SelectTrigger className="h-6 text-xs bg-gray-800 text-gray-100 border-0"><SelectValue/></SelectTrigger>
                        <SelectContent className="bg-gray-800 border-gray-700">
                          {Object.keys(cfgs).map(n=><SelectItem key={n} value={n} className="text-gray-100">{n}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Dlg t={<B className="text-xs px-2">i</B>} o="Import" c={<form onSubmit={(e)=>{
                        e.preventDefault();
                        try{
                          upd(i,{messages:parseMsg(ref.current.value)});
                          setModal({t:'',c:''});
                        }catch{setModal({t:'Error',c:'Invalid format'});}
                      }}>
                        <textarea 
                          ref={ref} 
                          placeholder="Paste JSONL..." 
                          className="mt-4 w-full h-48 bg-gray-900 p-2 text-sm font-mono rounded"
                          onKeyDown={e => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                              e.preventDefault();
                              e.target.form.requestSubmit();
                            }
                          }}
                        />
                        <Button type="submit" className="mt-2 w-full">Import</Button>
                      </form>}/>
                      <B className="text-xs px-2" onClick={()=>setModal({t:'Export',c:JSON.stringify({messages:p.response?
                        [...p.messages,{role:'assistant',content:p.response}]:p.messages})})}>e</B>
                      <B className="h-6 w-6 p-0 ml-auto" onClick={()=>setPanels(x=>x.filter((_,n)=>n!==i))}><X className="h-3 w-3"/></B>
                    </div>

                    <div className="flex-1 overflow-y-auto min-h-0 pb-2">
                      <div className="space-y-1">
                        {p.messages.map((m,j) => (
                          <div key={j} className="space-y-1 bg-gray-800/30 p-1 rounded group" draggable="true"
                            onDragStart={e=>{
                              e.stopPropagation();
                              setDrag({i,j});
                              e.currentTarget.style.opacity='.5';
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragEnd={e=>{
                              e.stopPropagation();
                              e.currentTarget.style.opacity='1';
                              setDrag(null);
                            }}
                            onDragOver={e=>{
                              e.preventDefault();
                              e.stopPropagation();
                              e.dataTransfer.dropEffect = 'move';
                            }}
                            onDrop={e=>{
                              e.preventDefault();
                              e.stopPropagation();
                              if(!drag || drag.i !== i) return;
                              const n=panels.map((x,pi)=>{
                                if(pi!==i)return x;
                                const m=[...x.messages];
                                const[v]=m.splice(drag.j,1);
                                m.splice(j,0,v);
                                return{...x,messages:m};
                              });
                              setPanels(n);
                              save('panels',n);
                            }}
                          >
                            <div className="flex gap-2">
                              <GripVertical className="h-4 w-4 text-gray-500 opacity-0 group-hover:opacity-100 cursor-grab"/>
                              <input 
                                value={m.role} 
                                onChange={e=>upd(i,{messages:p.messages.map((x,mi)=>mi===j?{...x,role:e.target.value}:x)})}
                                onKeyDown={e=>{
                                  if(e.key === 'Enter') {
                                    e.preventDefault();
                                    e.target.blur();
                                  }
                                }}
                                className="text-xs bg-transparent w-16 outline-none"
                              />
                              <Trash2 
                                onClick={()=>upd(i,{messages:p.messages.filter((_,mi)=>mi!==j)})}
                                className="h-3 w-3 text-gray-500 opacity-0 group-hover:opacity-100 cursor-pointer ml-auto"
                              />
                            </div>
                            <textarea 
                              value={m.content} 
                              onChange={e => upd(i,{messages:p.messages.map((x,mi)=>
                                mi===j?{...x,content:e.target.value}:x)})} 
                              className="w-full bg-gray-800/50 text-sm p-1 rounded resize-vertical min-h-[2.5rem] selection:bg-blue-500/50"
                            />
                          </div>
                        ))}
                      </div>
                      {p.response!==undefined && (
                        <div className="relative mt-2">
                          <textarea 
                            value={p.response} 
                            onChange={e => upd(i, { response: e.target.value })}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                e.preventDefault();
                                call(p, i);
                              }
                            }}
                            className="w-full bg-gray-800/70 text-sm p-1 rounded resize-vertical min-h-[100px] pr-8"
                          />
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="absolute top-4 right-2 opacity-50 hover:opacity-100"
                            onClick={() => setModal({
                              t: 'Response', 
                              c: <ResponseModal 
                                  content={p.response} 
                                  onSave={(newContent) => {
                                    upd(i, {response: newContent});
                                    setModal({t:'',c:''});
                                  }}
                                />
                            })}
                          >
                            <Maximize2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="sticky bottom-0 bg-gray-900 py-2">
                      <div className="flex justify-between">
                        <B className="text-xs h-6" onClick={()=>upd(i,{messages:[...p.messages,{role:'user',content:''}]})}>+ msg</B>
                        <B className="text-xs h-6" onClick={()=>call(p, i)}>call</B>
                      </div>
                      {timing[i] && (
                        <div className="text-xs text-gray-500 mt-1 text-center">
                          TTFT: {timing[i].latency}ms {timing[i].total && `• EOS: ${timing[i].total}ms`}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Resize Handle */}
                  {i < panels.length - 1 && (
                    <div 
                      className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/50 z-10"
                      onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        e.preventDefault();
                        e.stopPropagation();

                        const panelElement = e.currentTarget.closest('.panel');
                        if (!panelElement) return;
                        const nextPanelElement = panelElement.nextElementSibling;
                        if (!nextPanelElement) return;
                        
                        const startX = e.clientX;
                        const panel1Width = panelWidths[i] || panelElement.offsetWidth;
                        const panel2Width = panelWidths[i + 1] || nextPanelElement.offsetWidth;
      
                        const handleMouseMove = (moveEvent) => {
                          const deltaX = moveEvent.clientX - startX;
                          const newPanel1Width = panel1Width + deltaX;
                          const newPanel2Width = panel2Width - deltaX;
      
                          // Set minimum widths
                          const minWidth = 320;
                          if (newPanel1Width < minWidth || newPanel2Width < minWidth) return;
      
                          setPanelWidths(prev => ({
                            ...prev,
                            [i]: newPanel1Width,
                            [i + 1]: newPanel2Width
                          }));
                        };
      
                        const handleMouseUp = () => {
                          document.removeEventListener('mousemove', handleMouseMove);
                          document.removeEventListener('mouseup', handleMouseUp);
                          document.body.style.cursor = '';
                        };
      
                        document.body.style.cursor = 'col-resize';
                        document.addEventListener('mousemove', handleMouseMove);
                        document.addEventListener('mouseup', handleMouseUp);
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 p-2 bg-gray-900 border-t border-gray-800">
        <div className="flex justify-between items-center">
          <div className="flex gap-2">
            <Dlg 
              t={<B><Plus className="h-4 w-4 mr-1"/>panel</B>} 
              o="Copy from panel" 
              c={<CopyPanelContent 
                panels={panels} 
                onCopy={i => {
                  setPanels(p=>[...p,{
                    id:Date.now(),
                    configName:p[i]?.configName||'default-openai',
                    messages:[...(p[i]?.messages||[])],
                    response:''
                  }]);
                  setModal({t:'',c:''});
                }}
              />}
            />
            <Dlg 
             t={<B>Import JSONL to all panels</B>} 
             o="Import to All Panels" 
             c={<form onSubmit={(e)=>{
               e.preventDefault();
               try{
                 const m=parseMsg(ref.current.value);
                 setPanels(p=>p.map(x=>({...x,messages:m})));
                 save('panels',panels);
                 setModal({t:'',c:''});
               }catch{setModal({t:'Error',c:'Invalid format'});}
             }}>
               <textarea 
                 ref={ref} 
                 placeholder="Paste JSONL..."
                 onKeyDown={e => {
                   if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                     e.preventDefault();
                     e.target.form.requestSubmit();
                   }
                 }}
                 className="mt-4 w-full h-48 bg-gray-900 p-2 text-sm font-mono rounded"
               />
               <Button type="submit" className="mt-2 w-full">Import</Button>
             </form>}
           />
         </div>
         <div className="flex gap-2 items-center">
           <B onClick={() => {
             panels.forEach((panel, idx) => {
               call(panel, idx);
             });
           }}>Call All</B>
         </div>
       </div>
     </div>

     {/* Modal */}
     {modal.c && (
       <Dialog open onOpenChange={() => setModal({t:'',c:''})}>
         {modal.t === 'Response' ? modal.c : (
           <M t={modal.t} c={
             <>
               <textarea 
                 value={modal.c} 
                 readOnly 
                 className="mt-4 w-full h-48 bg-gray-900 p-2 text-sm font-mono rounded" 
                 onClick={e => e.target.select()}
               />
               <B 
                 className="mt-2" 
                 onClick={() => {
                   navigator.clipboard.writeText(modal.c);
                   setModal(m => ({...m,t:'Copied!'}));
                 }}
               >
                 Copy <Copy className="ml-2 h-4 w-4"/>
               </B>
             </>
           }/>
         )}
       </Dialog>
     )}
   </div>
 );
}

export default ModelPlayground;
