/* Keep mobile answer controls inside the visual viewport, including browsers
   whose keyboard overlays the layout viewport. No persisted state. */
(function(root){
  "use strict";
  function viewport(height, top, scale, fallback){
    return {height:Math.max(1, Number(height)||fallback), top:Math.max(0, Number(top)||0), zoomed:Math.abs((Number(scale)||1)-1)>.05};
  }
  function install(){
    const doc=root.document;
    if(!doc || doc.getElementById("keyboard-style"))return;
    const style=doc.createElement("style");style.id="keyboard-style";
    style.textContent=`
      body.keyboard-editing{position:fixed;top:var(--keyboard-top);left:0;width:100%;
        height:var(--keyboard-height);min-height:0;overflow:hidden}
      .keyboard-editing #screen{min-height:0;flex:1}
      .keyboard-editing #screen>*{flex-shrink:0}
      .keyboard-editing #topbar,.keyboard-editing #tabs{flex-shrink:0}
      .keyboard-open #tabs{display:none}
      .keyboard-dock-active{position:sticky;bottom:0;z-index:2;background:var(--panel);
        padding:8px 0;scroll-margin:8px}
      .keyboard-dock-active textarea{min-height:60px;max-height:100px}
      .keyboard-editing .modal-back{top:var(--keyboard-top);bottom:auto;height:var(--keyboard-height)}
      .keyboard-editing .modal{max-height:100%;overflow-y:auto}
    `;
    doc.head.appendChild(style);
    const vv=root.visualViewport, body=doc.body;
    let input=null,dock=null,frame=0,ensure=false,baseline=root.innerHeight;
    function editable(el){return el?.matches('textarea,input:not([type]),input[type="text"],input[type="search"],input[type="password"],input[type="number"],input[type="email"],input[type="url"]') && !el.disabled && !el.readOnly;}
    function reset(){
      dock?.classList.remove("keyboard-dock-active");dock=null;input=null;
      body.classList.remove("keyboard-editing","keyboard-open");
      body.style.removeProperty("--keyboard-height");body.style.removeProperty("--keyboard-top");
    }
    function update(){
      frame=0;
      const active=doc.activeElement;
      if(!editable(active) || !active.isConnected){reset();return;}
      if(input!==active){
        dock?.classList.remove("keyboard-dock-active");
        input=active;dock=input.closest("[data-keyboard-dock]");ensure=true;
      }
      const v=viewport(vv?.height,vv?.offsetTop,vv?.scale,root.innerHeight);
      // Pinch zoom must retain the browser's native panning and magnification.
      if(v.zoomed){reset();return;}
      body.style.setProperty("--keyboard-height",v.height+"px");
      body.style.setProperty("--keyboard-top",v.top+"px");
      body.classList.add("keyboard-editing");
      body.classList.toggle("keyboard-open",Math.max(baseline,root.innerHeight)-v.height>100);
      dock?.classList.add("keyboard-dock-active");
      if(ensure){
        ensure=false;
        // Move the original controls together; never clone an input or its value.
        const target=dock||input, rect=target.getBoundingClientRect();
        const scroller=input.closest(".modal")||doc.getElementById("screen");
        if(scroller){
          const bounds=scroller.getBoundingClientRect(), bottom=Math.min(bounds.bottom,v.top+v.height)-8;
          const top=Math.max(bounds.top,v.top)+8;
          if(rect.bottom>bottom)scroller.scrollTop+=rect.bottom-bottom;
          else if(rect.top<top)scroller.scrollTop-=top-rect.top;
        }
      }
    }
    function schedule(reveal=false){ensure=ensure||reveal;if(!frame)frame=root.requestAnimationFrame(update);}
    doc.addEventListener("focusin",()=>schedule(true));
    doc.addEventListener("focusout",()=>schedule());
    doc.addEventListener("input",()=>schedule(true));
    // A blur on pointerdown would move the controls before the click lands.
    // Keep focus through the tap; each successful submit explicitly blurs.
    doc.addEventListener("pointerdown",event=>{
      if(input && event.target.closest("button") && body.classList.contains("keyboard-editing"))event.preventDefault();
    });
    root.addEventListener("resize",()=>{if(!editable(doc.activeElement))baseline=root.innerHeight;schedule(true);});
    vv?.addEventListener("resize",()=>schedule(true));
    vv?.addEventListener("scroll",()=>schedule());
    new MutationObserver(()=>{
      if(input && (!input.isConnected || input.disabled || input.readOnly))schedule();
    }).observe(body,{subtree:true,childList:true,attributes:true,attributeFilter:["disabled","readonly"]});
  }
  const api={install,pure:{viewport}};
  if(typeof module!=="undefined" && module.exports)module.exports=api;
  else root.SORI_KEYBOARD=api;
})(typeof window!=="undefined"?window:globalThis);
