(async()=>{
  if(window.previewBooted)return;window.previewBooted=true;
  const query=new URLSearchParams(location.search),state=query.get('state')||'menu';
  const theme=query.get('theme')||'dark';
  if(query.get('zoom')==='2')document.body.style.zoom='2';
  if(['verify','motion-verify','layout-verify','preview-motion-verify','motion-reference'].includes(state))return;
  if(location.pathname==='/popup.html'){
    const check=()=>!document.getElementById('fields').disabled;
    for(let i=0;i<100&&!check();i++)await new Promise(r=>setTimeout(r,20));
    document.documentElement.dataset.theme=theme;
    document.querySelector('[name=theme]').value=theme;
    document.querySelector('[name=theme]').dispatchEvent(new Event('change'));
    if(document.querySelector('[name=surface]')){
      document.querySelector('[name=surface]').value=query.get('surface')||'glass';
      document.querySelector('[name=surface]').dispatchEvent(new Event('change'));
    }
    if(state==='advanced')document.querySelectorAll('details').forEach(d=>d.open=true);
    return;
  }
  for(let i=0;i<100&&!document.getElementById('floating-bookmarks-extension')?.shadowRoot.querySelector('.bookmark');i++)await new Promise(r=>setTimeout(r,20));
  await chrome.runtime.sendMessage({type:'SET_SETTINGS',patch:{pinned:true,enabled:true,theme,surface:query.get('surface')||'glass',topOffset:Number(query.get('topOffset')??2),menuGap:Number(query.get('menuGap')??2),rootId:state==='empty'?'12':'auto',excludedHosts:[]}});
  const root=document.getElementById('floating-bookmarks-extension').shadowRoot;
  if(state==='motion-demo'){
    const folder=fixture.tree[0].children[0].children.find(n=>n.id==='18');
    folder.children=['网站设计参考','配色工具','字体与排版','组件设计','图标资源','交互参考'].map((title,i)=>({id:`demo-${i}`,title,url:`https://example.com/design/${i}`}));
    const before=root.querySelector('.bookmark[title="设计"]');
    fixture.messages.fire({type:'BOOKMARKS_CHANGED'});
    for(let i=0;i<100&&root.querySelector('.bookmark[title="设计"]')===before;i++)await new Promise(r=>setTimeout(r,20));
    const control=document.getElementById('outside');control.textContent='演示菜单切换';
    let running=false;
    control.addEventListener('click',async()=>{
      if(running)return;running=true;
      root.querySelector('.bookmark[title="网盘"]').click();
      for(const title of ['设计','在线视频','常用网站','网盘']){
        await Promise.all([...root.querySelectorAll('.panel')].flatMap(p=>p.getAnimations({subtree:true})).map(a=>a.finished.catch(()=>{})));
        await new Promise(r=>setTimeout(r,300));
        root.querySelector(`.bookmark[title="${title}"]`).dispatchEvent(new PointerEvent('pointerenter'));
      }
      running=false;
    });
  }
  if(state==='menu'){
    root.querySelector('button[title="在线视频"]').click();
    root.querySelector('button[title="纪录片"]').dispatchEvent(new PointerEvent('pointerenter'));
  }
  if(state==='search'||state==='no-results'||state==='error'){
    root.querySelector('button[aria-label="搜索书签"]').click();
    const input=root.querySelector('input');input.value=state==='no-results'?'不存在的收藏':'Chrome';input.dispatchEvent(new Event('input'));
    if(state==='error'){fixture.failOpen=true;root.querySelector('.row').click();}
  }
  document.documentElement.dataset.previewReady='true';
})();
