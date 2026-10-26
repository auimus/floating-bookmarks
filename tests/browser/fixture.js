(() => {
  const event = () => {
    const listeners=[];
    return {addListener:fn=>listeners.push(fn), fire:(...args)=>listeners.forEach(fn=>fn(...args))};
  };
  const folder=(id,title,children)=>({id,title,children});
  const link=(id,title,url)=>({id,title,url});
  const tree=[folder('0','',[
    {...folder('1','书签栏',[
      folder('10','网盘',[link('100','阿里云盘','https://www.alipan.com/'),link('101','百度网盘','https://pan.baidu.com/')]),
      folder('11','在线视频',[link('110','哔哩哔哩','https://www.bilibili.com/'),folder('111','纪录片',[link('112','纪录片收藏','https://example.com/documentary')])]),
      folder('12','视频下载',[]),folder('13','软件下载',[]),folder('14','论坛',[]),folder('15','图库',[]),folder('16','email',[]),
      folder('17','常用网站',[link('170','示例网站','https://example.com/')]),folder('18','设计',[]),
      folder('19','程序员',[link('190','Chrome 扩展文档','https://developer.chrome.com/docs/extensions/'),link('191','<img src=x onerror="window.xss=true">','https://example.com/xss')]),
      folder('20','项目',[]),folder('21','公司',[]),folder('22','AI',[]),folder('23','NAS',[]),folder('24','服务器',[]),folder('25','当前项目',[]),folder('26','PT合集',[])
    ]),folderType:'bookmarks-bar'},folder('2','其他书签',[link('200','其他收藏','https://example.com/other')])
  ])];
  window.fixture={tree,opened:[],failSave:false,failOpen:false,failRead:false};
  const changes=event(), messages=event();
  window.chrome={storage:{onChanged:changes},runtime:{getURL:path=>new URL(path,location.origin).href,onMessage:messages,sendMessage:async message=>{
    let settings=FloatingBookmarks.normalizeSettings(JSON.parse(localStorage.getItem('fixture-settings')||'null')||{});
    switch(message.type){
      case 'GET_STATE': return fixture.failRead?{ok:false,error:'书签读取失败'}:{ok:true,tree,settings};
      case 'SET_SETTINGS': {
        if(fixture.failSave)return {ok:false,error:'设置保存失败'};
        const oldValue=settings;
        settings=FloatingBookmarks.normalizeSettings({...settings,...message.patch});
        localStorage.setItem('fixture-settings',JSON.stringify(settings));
        changes.fire({settings:{oldValue,newValue:settings}},'local');
        return {ok:true,settings};
      }
      case 'OPEN_BOOKMARK':
        if(fixture.failOpen)return {ok:false,error:'书签已被删除，请重试'};
        fixture.opened.push(message);return {ok:true};
      case 'OPEN_OPTIONS': window.open('/popup.html'); return {ok:true};
      case 'OPEN_MANAGER': fixture.manager=true;return {ok:true};
    }
  }}};
  fixture.messages=messages;
})();
