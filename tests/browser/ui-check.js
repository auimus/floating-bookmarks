(async()=>{
  const query=new URLSearchParams(location.search),run=query.get('run')||'1';
  const suite=location.pathname==='/popup.html'?'popup':'bar';
  const result={suite,run,checks:[],failures:[]};
  const wait=async test=>{const deadline=Date.now()+5000;while(!test()){if(Date.now()>deadline)throw Error('等待条件超时');await new Promise(r=>setTimeout(r,20));}};
  const check=(name,value)=>{if(!value)throw Error(name);result.checks.push(name);};
  const storage=()=>JSON.parse(localStorage.getItem('fixture-settings'));
  try{
    if(suite==='popup'){
      await wait(()=>!document.getElementById('fields').disabled);
      const form=document.getElementById('settings');
      const key='popup-check-v3-'+run;
      const phase=sessionStorage.getItem(key);
      if(!phase){
        document.querySelector('[data-theme-choice=light]').click();
        document.querySelector('[data-surface-choice=solid]').click();
        check('外观切换即时预览',document.documentElement.dataset.theme==='light'&&document.querySelector('[data-theme-choice=light]').getAttribute('aria-pressed')==='true');
        form.elements.rootId.value='19';form.elements.hideDelay.value='650';
        form.elements.topOffset.value='7';form.elements.menuGap.value='3';
        form.requestSubmit();
        await wait(()=>document.getElementById('status').textContent==='已保存');
        check('设置保存完成',storage().rootId==='19'&&storage().theme==='light'&&storage().surface==='solid'&&storage().hideDelay===650);
        check('两项间距独立保存',storage().topOffset===7&&storage().menuGap===3);
        sessionStorage.setItem(key,JSON.stringify(result.checks));location.reload();return;
      }
      result.checks.push(...JSON.parse(phase));
      check('刷新后读回外观、样式与目录',form.elements.theme.value==='light'&&form.elements.surface.value==='solid'&&form.elements.rootId.value==='19'&&form.elements.hideDelay.value==='650');
      check('刷新后读回两项间距',form.elements.topOffset.value==='7'&&form.elements.menuGap.value==='3');
      form.elements.topOffset.value='25';check('顶部间距上限校验',!form.elements.topOffset.checkValidity());
      form.elements.topOffset.value='7';form.elements.menuGap.value='-1';check('菜单间距下限校验',!form.elements.menuGap.checkValidity());
      form.elements.menuGap.value='3';
      fixture.failSave=true;
      document.querySelector('[data-theme-choice=system]').click();document.querySelector('[data-surface-choice=glass]').click();form.requestSubmit();
      await wait(()=>document.getElementById('status').dataset.error==='true');
      check('保存失败保留输入与旧数据',form.elements.theme.value==='system'&&form.elements.surface.value==='glass'&&storage().surface==='solid'&&storage().theme==='light'&&!document.getElementById('fields').disabled);
      fixture.failSave=false;form.elements.excludedHosts.value='https://invalid.example/path';form.requestSubmit();
      await wait(()=>document.getElementById('status').textContent.includes('请输入域名'));
      check('域名输入错误可见',document.getElementById('status').dataset.error==='true'&&form.elements.excludedHosts.value.includes('https://'));
      form.elements.excludedHosts.value='example.com\nwww.example.com';document.querySelector('[data-theme-choice=dark]').click();form.requestSubmit();
      await wait(()=>document.getElementById('status').textContent==='已保存');
      check('失败后可继续保存',storage().excludedHosts.length===2&&storage().theme==='dark');
      document.getElementById('manager').click();await wait(()=>fixture.manager===true);check('管理书签入口',fixture.manager);
      check('无多余口号或制作说明',!document.body.innerText.includes('跟随截图')&&!document.body.innerText.includes('需要时出现'));
      sessionStorage.removeItem(key);
    }else{
      await wait(()=>document.getElementById('floating-bookmarks-extension')?.shadowRoot.querySelector('.bookmark'));
      const host=document.getElementById('floating-bookmarks-extension'),s=host.shadowRoot;
      check('悬浮栏无品牌占位',!s.querySelector('.brand')&&s.querySelector('.bar').firstElementChild.className==='bookmarks');
      // Isolate synthetic pointer checks from the screenshot browser's stationary cursor.
      const pointerIsolation=document.createElement('style');pointerIsolation.textContent='*{pointer-events:none!important}';s.append(pointerIsolation);
      const request=patch=>chrome.runtime.sendMessage({type:'SET_SETTINGS',patch});
      const click=selector=>{const target=s.querySelector(selector);if(!target)throw Error('找不到 '+selector);target.click();};
      const queryText=text=>{const input=s.querySelector('input');input.value=text;input.dispatchEvent(new Event('input'));};
      await request({enabled:true,pinned:false,rootId:'auto',theme:'dark',excludedHosts:[],hoverDelay:0,hideDelay:150});
      if(host.hasAttribute('data-open'))fixture.messages.fire({type:'TOGGLE_BAR'});
      check('收起后栏退出绘制且无滤镜或位移',getComputedStyle(s.querySelector('.bar')).display==='none'&&getComputedStyle(s.querySelector('.bar')).backdropFilter==='none'&&getComputedStyle(s.querySelector('.bar')).transform==='none');
      s.querySelector('.trigger').dispatchEvent(new PointerEvent('pointerenter'));await wait(()=>host.hasAttribute('data-open'));
      check('顶部触发展开',host.hasAttribute('data-open'));
      s.querySelector('.bar').dispatchEvent(new PointerEvent('pointerleave'));await wait(()=>!host.hasAttribute('data-open'));check('离开后自动收起',true);
      check('自动收起后清理动画与绘制',s.querySelector('.bar').getAnimations().length===0&&getComputedStyle(s.querySelector('.bar')).display==='none');
      await request({pinned:true});
      click('.bookmark[title="在线视频"]');s.querySelector('.row[title="纪录片"]').dispatchEvent(new PointerEvent('pointerenter'));
      check('多级文件夹展开',s.querySelectorAll('.panel').length===2);click('.row[title^="纪录片收藏"]');await wait(()=>fixture.opened.at(-1)?.id==='112'&&s.querySelectorAll('.panel').length===0);
      check('书签请求按正确ID发送',true);
      click('[aria-label="搜索书签"]');queryText('程序员 CHROME');check('搜索匹配名称与路径',s.querySelectorAll('.row').length===1&&s.querySelector('.count').textContent==='1 项结果');
      s.querySelector('input').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
      check('键盘选择结果',s.activeElement?.classList.contains('row'));click('.row');await wait(()=>fixture.opened.at(-1)?.id==='190'&&s.querySelectorAll('.panel').length===0);
      click('[aria-label="搜索书签"]');queryText('<img');check('标题按文字渲染',!window.xss&&!s.querySelector('img:not(.favicon)'));
      fixture.failOpen=true;click('.row');await wait(()=>s.querySelector('.toast'));
      check('打开失败保留搜索',s.querySelector('input').value==='<img'&&s.querySelector('.toast').textContent.includes('删除'));
      click('[aria-label="关闭提示"]');check('错误提示可关闭',!s.querySelector('.toast'));fixture.failOpen=false;
      click('[aria-label="清空搜索"]');check('搜索清空控件',s.querySelector('input').value===''&&s.querySelectorAll('.row').length===0);
      queryText('不存在的书签');check('搜索空状态',s.querySelectorAll('.row').length===0&&s.querySelector('.empty').textContent.includes('没有匹配'));
      s.querySelector('input').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));check('Esc关闭菜单',s.querySelectorAll('.panel').length===0);
      await request({rootId:'12'});check('空目录可识别',s.querySelector('.bookmarks').textContent.includes('没有书签'));
      await request({enabled:false});check('禁用生效',getComputedStyle(host).display==='none');
      await request({enabled:true,excludedHosts:[location.hostname]});check('排除网站生效',getComputedStyle(host).display==='none');
      await request({excludedHosts:[],rootId:'auto',theme:'light',surface:'glass'});check('浅色外观生效',host.dataset.theme==='light');
      check('磨砂样式生效',host.dataset.surface==='glass'&&getComputedStyle(s.querySelector('.bar')).backdropFilter.includes('blur'));
      await request({surface:'solid'});check('纯色样式生效',host.dataset.surface==='solid'&&getComputedStyle(s.querySelector('.bar')).backdropFilter==='none');
      fixture.tree[0].children[0].children.push({id:'new',title:'新收藏',url:'https://example.com/new'});fixture.messages.fire({type:'BOOKMARKS_CHANGED'});
      await wait(()=>[...s.querySelectorAll('.bookmark')].some(b=>b.textContent==='新收藏'));check('书签更新通知',true);
      check('固定状态保持',host.hasAttribute('data-open'));
      fixture.tree[0].children[0].children.push(
        {id:'icon-ok',title:'图标成功',url:'https://example.com/?q=中文&x=1#part'},
        {id:'icon-fail',title:'图标失败',url:'https://broken.example/'},
        {id:'icon-script',title:'脚本地址',url:'javascript:alert(1)'}
      );
      fixture.messages.fire({type:'BOOKMARKS_CHANGED'});
      await wait(()=>s.querySelector('.bookmark[title^="图标成功"]'));
      const good=s.querySelector('.bookmark[title^="图标成功"]');
      await wait(()=>good.querySelector('.favicon')?.naturalWidth>0&&!good.querySelector('.favicon').hidden);
      const address=new URL(good.querySelector('.favicon').src);
      check('图标URL使用Chrome内置路径并正确编码',address.pathname==='/_favicon/'&&address.searchParams.get('size')==='32'&&address.searchParams.get('pageUrl')==='https://example.com/?q=中文&x=1#part');
      check('加载后显示图标并隐藏占位',good.querySelector('svg').hasAttribute('hidden')&&good.querySelector('.favicon').width===16);
      const failed=s.querySelector('.bookmark[title^="图标失败"]');
      await wait(()=>!failed.querySelector('.favicon'));
      check('图标失败保留地球兜底',!failed.querySelector('svg').hasAttribute('hidden'));
      check('脚本书签与文件夹不请求网站图标',!s.querySelector('.bookmark[title^="脚本地址"] .favicon')&&!s.querySelector('.folder .favicon'));
      click('[aria-label="搜索书签"]');queryText('图标成功');
      await wait(()=>s.querySelector('.row .favicon')?.naturalWidth>0&&!s.querySelector('.row .favicon').hidden);
      check('搜索结果显示网站图标',s.querySelector('.row svg').hasAttribute('hidden'));
    }
  }catch(error){result.failures.push(error.message);console.error(error);}
  document.title=result.failures.length?'验证失败':'验证通过';
  const proof=document.createElement('pre');proof.id='test-proof';proof.style.cssText='position:fixed;bottom:0;left:0;right:0;background:#fff;color:#162b48;padding:16px;z-index:2147483647;font:14px monospace';proof.textContent=JSON.stringify(result,null,2);document.body.append(proof);
  await fetch('/test-result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(result)});
})();
