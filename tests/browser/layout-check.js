(async()=>{
  const result={suite:'bar',run:new URLSearchParams(location.search).get('run')||'layout',checks:[],failures:[]};
  const check=(name,value)=>{if(!value)throw Error(name);result.checks.push(name);};
  const wait=async test=>{const deadline=Date.now()+5000;while(!test()){if(Date.now()>deadline)throw Error('等待条件超时');await new Promise(r=>setTimeout(r,20));}};
  try{
    await wait(()=>document.getElementById('floating-bookmarks-extension')?.shadowRoot.querySelector('.bookmark'));
    const host=document.getElementById('floating-bookmarks-extension'),s=host.shadowRoot,bar=s.querySelector('.bar');
    const isolation=document.createElement('style');isolation.textContent='*{pointer-events:none!important}';s.append(isolation);
    const request=patch=>chrome.runtime.sendMessage({type:'SET_SETTINGS',patch});
    const click=title=>s.querySelector(`.bookmark[title="${title}"]`).click();
    const settle=async()=>{
      await Promise.race([
        Promise.all([...s.querySelectorAll('.bar,.panel,.bookmark-selection')].flatMap(e=>e.getAnimations({subtree:true})).map(a=>a.finished.catch(()=>{}))),
        new Promise((_,reject)=>setTimeout(()=>reject(Error('动画未在 5 秒内完成')),5000))
      ]);
    };
    const gap=()=>s.querySelector('.panel').getBoundingClientRect().top-bar.getBoundingClientRect().bottom;
    const near=(a,b)=>Math.abs(a-b)<.1;
    check('旧设置补齐两项 2px 默认值',FloatingBookmarks.normalizeSettings({pinned:true}).topOffset===2&&FloatingBookmarks.normalizeSettings({}).menuGap===2);
    await request({enabled:true,pinned:true,rootId:'auto',topOffset:2,menuGap:2,excludedHosts:[]});
    await settle();click('在线视频');await settle();
    check('默认顶部与菜单间距均为 2px',near(bar.getBoundingClientRect().top,2)&&near(gap(),2));
    check('展开菜单时书签栏没有整条外阴影',getComputedStyle(bar).boxShadow==='none');
    check('菜单保留自身阴影',getComputedStyle(s.querySelector('.panel')).boxShadow!=='none');
    await request({topOffset:11});await settle();click('网盘');await settle();
    check('顶部间距即时更新且不改变菜单间距',near(bar.getBoundingClientRect().top,11)&&near(gap(),2));
    await request({menuGap:9});click('网盘');await settle();
    check('菜单间距即时更新且不改变顶部间距',near(bar.getBoundingClientRect().top,11)&&near(gap(),9));
    await request({topOffset:0,menuGap:0});click('网盘');await settle();
    check('两项均支持 0px',near(bar.getBoundingClientRect().top,0)&&near(gap(),0));
    await request({topOffset:24,menuGap:16});
    const folder=fixture.tree[0].children[0].children.find(n=>n.id==='18');
    folder.children=Array.from({length:100},(_,i)=>({id:`layout-${i}`,title:`收藏 ${i+1}`,url:`https://example.com/${i}`}));
    const previousDesign=s.querySelector('.bookmark[title="设计"]');
    fixture.messages.fire({type:'BOOKMARKS_CHANGED'});
    await wait(()=>s.querySelector('.bookmark[title="设计"]')!==previousDesign);
    click('设计');await settle();
    const bounds=s.querySelector('.panel').getBoundingClientRect();
    check('最大间距下长菜单可滚动且不越过视口底部',near(bounds.top,84)&&bounds.bottom<=innerHeight-7&&s.querySelector('.panel').scrollHeight>s.querySelector('.panel').clientHeight);
    for(const surface of ['glass','solid'])for(const theme of ['dark','light']){
      await request({surface,theme,topOffset:2,menuGap:2});await settle();click('网盘');await settle();
      s.querySelector('.bookmark[title="在线视频"]').dispatchEvent(new PointerEvent('pointerenter'));await settle();
      s.querySelector('.row[title="纪录片"]').dispatchEvent(new PointerEvent('pointerenter'));await settle();
      check(`${theme}/${surface} 多级菜单切换无整条阴影`,getComputedStyle(bar).boxShadow==='none'&&s.querySelectorAll('.panel').length===2&&near(gap(),2));
      s.querySelector('.row').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      check(`${theme}/${surface} 关闭后无菜单或动画残留`,s.querySelectorAll('.panel').length===0&&!s.querySelector('.is-switching')&&getComputedStyle(bar).boxShadow==='none');
    }
    await request({pinned:false,topOffset:2,menuGap:2});fixture.messages.fire({type:'TOGGLE_BAR'});
    await settle();
    fixture.messages.fire({type:'TOGGLE_BAR'});click('网盘');
    check('滑入动画尚未结束时菜单也按最终位置定位',near(parseFloat(s.querySelector('.panel').style.top),48));
    await settle();check('滑入完成后菜单间距仍为 2px',near(gap(),2));
  }catch(error){result.failures.push(error.message);console.error(error);}
  document.title=result.failures.length?'位置验证失败':'位置验证通过';
  const proof=document.createElement('pre');proof.id='test-proof';proof.textContent=JSON.stringify(result,null,2);document.body.append(proof);
  await fetch('/test-result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(result)});
})();
