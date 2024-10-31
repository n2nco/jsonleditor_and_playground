import React, { useState, useEffect, useRef } from 'react'; 
import { X, Plus, Save, RotateCcw, GripVertical, Trash2, Copy, Maximize2 } from 'lucide-react';
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
  ref = useRef();

  useEffect(() => { try {
    const c = JSON.parse(localStorage.getItem('cfgs')||'{}'), p = JSON.parse(localStorage.getItem('panels')||'[]');
    if(Object.keys(c).length) setCfgs(x=>({...x,...c})); if(p.length) setPanels(p);
  } catch{} }, []);

  const save = (k,v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch{} },
  parseMsg = t => { try { const d = JSON.parse(t); return d.messages||[d]; } catch { throw new Error('Invalid JSON'); }},
  upd = (i,u) => { 
    const n = panels.map((p,x) => x===i ? {...p, ...u} : p);
    setPanels(n);
    save('panels',n);
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

  const call = async (i) => {
    const p = panels[i];
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

        // Stream handling
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
            // Non-streaming case
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


  const Dlg = ({t,c,o}) => <Dialog><DialogTrigger asChild>{t}</DialogTrigger><M t={o} c={c}/></Dialog>;

  return (
    <div className="h-screen bg-gray-900 text-gray-100 flex">
      {modal.c && <Dialog open onOpenChange={()=>setModal({t:'',c:''})}>{modal.t === 'Response' ? modal.c : 
        <M t={modal.t} c={<>
          <textarea value={modal.c} readOnly className="mt-4 w-full h-48 bg-gray-900 p-2 text-sm font-mono rounded" onClick={e=>e.target.select()}/>
          <B className="mt-2" onClick={()=>{navigator.clipboard.writeText(modal.c); setModal(m=>({...m,t:'Copied!'}));}}>
            Copy <Copy className="ml-2 h-4 w-4"/>
          </B>
        </>}/>
      }</Dialog>}
      <div className="w-96 border-r border-gray-700 p-4 space-y-4">
      <div className="flex justify-between mb-4">
      <Select value={name} onValueChange={v=>{setName(v);setCur(cfgs[v]);setCurText(JSON.stringify(cfgs[v],null,2));setErr('');}}>
        <SelectTrigger className="w-64 text-gray-100 bg-gray-800 text-left">
          <SelectValue className="text-left truncate"/>
        </SelectTrigger>
        <SelectContent className="bg-gray-800 border-gray-700">
          {Object.keys(cfgs).map(n=><SelectItem key={n} value={n} className="text-gray-100">{n}</SelectItem>)}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-1">
        <Dlg t={<B><Plus className="h-3 w-3"/></B>} o="New Config" c={<div className="flex gap-2 mt-4">
          <input placeholder="Name" className="flex-1 bg-gray-900 p-2 rounded" id="n"/>
          <B onClick={()=>{const n=document.getElementById('n').value; if(!n||cfgs[n])return;
            const nc={...d.b,...d.o}; setCfgs(p=>({...p,[n]:nc})); setName(n); setCur(nc);
            setCurText(JSON.stringify(nc,null,2));
          }}><Plus className="h-4 w-4"/></B>
        </div>}/>
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
          style={{minHeight:'500px'}} 
          className={`w-full flex-1 font-mono text-xs bg-gray-800/50 p-2 rounded border ${err?'border-red-500':'border-gray-700'}`}
        />
        {err && <div className="text-xs text-red-500">{err}</div>}
      </div>
      <div className="flex-1 flex overflow-x-auto pr-4 pb-16"> {/* Added pb-16 for footer space */}
        {panels.map((p,i) => (
          <div key={p.id} className="flex-1 min-w-[320px] p-2 border-r border-gray-800 flex flex-col relative resize-x overflow-auto">
            <div className="flex gap-2 mb-2">
              <span className="text-xs text-gray-400">P{i+1}</span>
              <Select value={p.configName} onValueChange={v=>upd(i,{configName:v})}>
                <SelectTrigger className="h-6 text-xs bg-gray-800 text-gray-100 border-0"><SelectValue/></SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  {Object.keys(cfgs).map(n=><SelectItem key={n} value={n} className="text-gray-100">{n}</SelectItem>)}
                </SelectContent>
              </Select>
              <Dlg t={<B className="text-xs px-2">i</B>} o="Import" c={<>
                <textarea ref={ref} placeholder="Paste JSONL..." className="mt-4 w-full h-48 bg-gray-900 p-2 text-sm font-mono rounded"/>
                <B className="mt-2" onClick={()=>{try{
                  upd(i,{messages:parseMsg(ref.current.value)});
                }catch{setModal({t:'Error',c:'Invalid format'});}}}>Import</B>
              </>}/>
              <B className="text-xs px-2" onClick={()=>setModal({t:'Export',c:JSON.stringify({messages:p.response?
                [...p.messages,{role:'assistant',content:p.response}]:p.messages})})}>e</B>
              <B className="h-6 w-6 p-0 ml-auto" onClick={()=>setPanels(x=>x.filter((_,n)=>n!==i))}><X className="h-3 w-3"/></B>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 pb-2">
              <div className="space-y-1">
                {p.messages.map((m,j) => (
                  <div key={j} className="space-y-1 bg-gray-800/30 p-1 rounded group" draggable
                    onDragStart={e=>{setDrag({i,j});e.currentTarget.style.opacity='.5';}}
                    onDragEnd={e=>{e.currentTarget.style.opacity='1';setDrag(null);}}
                    onDragOver={e=>e.preventDefault()}
                    onDrop={()=>{
                      if(!drag)return;
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
                  ><div className="flex gap-2">
                      <GripVertical className="h-4 w-4 text-gray-500 opacity-0 group-hover:opacity-100 cursor-grab"/>
                      <input 
                        value={m.role} 
                        onChange={e=>upd(i,{messages:p.messages.map((x,mi)=>mi===j?{...x,role:e.target.value}:x)})}
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
                    readOnly
                    className="w-full bg-gray-800/50 text-sm p-1 rounded resize-vertical min-h-[100px] pr-8"
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
                <B className="text-xs h-6" onClick={()=>call(i)}>call</B>
              </div>
              {timing[i] && (
                <div className="text-xs text-gray-500 mt-1 text-center">
                  TTFT: {timing[i].latency}ms {timing[i].total && `• EOS: ${timing[i].total}ms`}
                </div>
              )}
            </div>
                      </div>
                    ))}
      </div>
      <div className="fixed bottom-0 left-0 right-0 p-2 bg-gray-900 border-t border-gray-800 z-10">
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
                }}
              />}
            />
            <Dlg 
              t={<B>import a JSONL chat to all panels</B>} 
              o="Import to All Panels" 
              c={<>
                <textarea 
                  ref={ref} 
                  placeholder="Paste JSONL..."
                  className="mt-4 w-full h-48 bg-gray-900 p-2 text-sm font-mono rounded"
                />
                <B className="mt-2" onClick={()=>{try{
                  const m=parseMsg(ref.current.value);
                  setPanels(p=>p.map(x=>({...x,messages:m})));
                  save('panels',panels);
                }catch{setModal({t:'Error',c:'Invalid format'});}}}>Import</B>
              </>}
            />
          </div>
          <B onClick={() => {
            const currentPanels = [...panels];
            currentPanels.forEach((_, i) => call(i));
          }}>Call All</B>
        </div>
      </div>
    </div>
  );
};

export default ModelPlayground;