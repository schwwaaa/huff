(function(){
  function tick(){const e=document.getElementById('clock');if(e)e.textContent=new Date().toLocaleTimeString();}
  tick();setInterval(tick,1000);

  const toc=document.getElementById('pageToc');
  if(toc){
    const hs=[...document.querySelectorAll('.doc-content h2,.doc-content h3')];
    if(hs.length){
      const ul=document.createElement('ul');
      hs.forEach((h,i)=>{if(!h.id)h.id='section-'+(i+1);const li=document.createElement('li');const a=document.createElement('a');a.href='#'+h.id;a.textContent=h.textContent;li.appendChild(a);ul.appendChild(li)});
      toc.appendChild(ul);
    } else toc.hidden=true;
  }

  const q=document.getElementById('docSearch');
  const out=document.getElementById('searchResults');
  if(q&&out&&window.HUFF_DOCS_INDEX){
    const render=()=>{
      const v=q.value.trim().toLowerCase();
      out.innerHTML='';
      if(v.length<2)return;
      const hits=window.HUFF_DOCS_INDEX.filter(x=>(x.title+' '+x.keywords).toLowerCase().includes(v)).slice(0,12);
      hits.forEach(x=>{const a=document.createElement('a');a.href=x.url;a.textContent=x.title;out.appendChild(a)});
      if(!hits.length)out.textContent='No documentation page matched.';
    };
    q.addEventListener('input',render);
  }

  const carousels=[...document.querySelectorAll('[data-carousel]')];
  carousels.forEach(root=>{
    const slides=[...root.querySelectorAll('.carousel-slide')];
    if(!slides.length)return;
    const status=root.querySelector('.carousel-index');
    let idx=0;
    const render=()=>{
      slides.forEach((s,i)=>s.classList.toggle('active',i===idx));
      if(status)status.textContent=(idx+1)+' / '+slides.length;
    };
    const prev=root.querySelector('[data-prev]');
    const next=root.querySelector('[data-next]');
    if(prev)prev.addEventListener('click',()=>{idx=(idx-1+slides.length)%slides.length;render();});
    if(next)next.addEventListener('click',()=>{idx=(idx+1)%slides.length;render();});
    render();
  });
})();
