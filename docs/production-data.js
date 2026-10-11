/* Situations de production, ids durables. Chaque variante est une phrase relue,
   jamais une grammaire ouverte : une réponse hors corpus reste sans note. */
(function(root){
  "use strict";
  const goals = [
    ["place", "Situer une action", "에서"],
    ["recipient", "Dire à qui", "에게 · 한테 · 께"],
    ["addition", "Ajouter au bon endroit", "도"],
    ["restriction", "Restreindre au bon endroit", "만 · 밖에"],
    ["range", "Relier un départ et une arrivée", "부터 · 에서 · 까지"],
    ["contrast", "Exprimer un contraste", "지만 · 는데"],
    ["condition", "Poser une condition", "(으)면"],
    ["purpose", "Donner le but d’un déplacement", "(으)려고 · (으)러"],
    ["simultaneous", "Faire deux choses en même temps", "(으)면서"],
    ["modifier", "Préciser de quelle personne ou chose on parle", "는 + nom"]
  ].map(([id,label,forms])=>({id,label,forms}));
  const endings = {
    "공부해요":["공부해요","공부합니다","공부해"], "일해요":["일해요","일합니다","일해"],
    "먹어요":["먹어요","먹습니다","먹어"], "읽어요":["읽어요","읽습니다","읽어"],
    "마셔요":["마셔요","마십니다","마셔"], "줘요":["줘요","주어요","줍니다","줘"],
    "보내요":["보내요","보냅니다","보내"], "드려요":["드려요","드립니다","드려"],
    "사요":["사요","삽니다","사"], "걸어요":["걸어요","걷습니다","걸어"],
    "쉬어요":["쉬어요","쉽니다","쉬어"], "가벼워요":["가벼워요","가볍습니다","가벼워"],
    "맛있어요":["맛있어요","맛있습니다","맛있어"], "재미있어요":["재미있어요","재밌어요","재미있습니다","재미있어"],
    "있어요":["있어요","있습니다","있어"], "사지 않아요":["사지 않아요","사지 않습니다","사지 않아","안 사요","안 삽니다","안 사"],
    "가요":["가요","갑니다","가"], "작아요":["작아요","작습니다","작아"],
    "친구예요":["친구예요","친구입니다","친구야"], "아이예요":["아이예요","아이입니다","아이야"],
    "불러요":["불러요","부릅니다","불러"]
  };
  const e = word => endings[word] || [word];
  const sample = part => Array.isArray(part) ? part.find(Boolean)||"" : part;
  const self = parts => [["","저는","제가","나는","내가"], ...parts];
  const p = (form, parts) => ({form,parts});
  const items = [];
  function add(id,goal,prompt,needs,answer,explanation,accept,wrong=[]){
    items.push({id,goal,prompt,needs:needs.split(" "),answer,explanation,accept,
      wrong:wrong.map(([parts,feedback])=>({parts,feedback}))});
  }
  const loc = [
    ["home","집","공부하다","J’étudie à la maison.","공부해요",null],
    ["school","학교","일하다","Je travaille à l’école.","일해요",null],
    ["restaurant","식당","먹다 밥","Je mange au restaurant.","먹어요",["","밥을","밥"]],
    ["library","도서관","읽다 책","Je lis un livre à la bibliothèque.","읽어요",["책을","책"]],
    ["cafe","카페","마시다 커피","Je bois du café au café.","마셔요",["커피를","커피"]]
  ];
  for(const [id,noun,needs,prompt,verb,obj] of loc){
    const tail = obj ? [obj,e(verb)] : [e(verb)];
    add("place-"+id,"place",prompt,noun+" "+needs,
      noun+"에서 "+(obj ? (obj[0]||obj[1])+" " : "")+verb,
      noun+" + 에서 situe l’endroit où l’action se déroule. 에 sert notamment à la destination ou à la présence.",
      [p("에서",self([noun+"에서",...tail])), ...(obj?[p("에서",self([obj,noun+"에서",e(verb)]))]:[])],
      [[self([noun+"에",...tail]),"L’action se déroule dans ce lieu : attache 에서 au lieu."]]);
  }
  const recipients = [
    ["friend","친구","책","책을","주다","줘요","Je donne un livre à un ami.",["친구에게","친구한테"]],
    ["child","아이","물","물을","주다","줘요","Je donne de l’eau à un enfant.",["아이에게","아이한테"]],
    ["mother","어머니","편지","편지를","보내다","보내요","J’envoie une lettre à ma mère.",["어머니에게","어머니한테","어머니께","엄마에게","엄마한테"]],
    ["father","아버지","선물","선물을","주다","줘요","Je donne un cadeau à mon père.",["아버지에게","아버지한테","아버지께","아빠에게","아빠한테"]],
    ["sibling","동생","빵","빵을","주다","줘요","Je donne du pain à mon petit frère ou à ma petite sœur.",["동생에게","동생한테"]]
  ];
  for(const [id,noun,obj,marked,verb,last,prompt,forms] of recipients){
    const v = id==="father" ? [...e(last),...e("드려요")] : e(last);
    add("recipient-"+id,"recipient",prompt,`${noun} ${obj} ${verb}`,`${forms[0]} ${marked} ${last}`,
      "에게 / 한테 marquent le destinataire. 께 est la variante respectueuse. La chose donnée ou envoyée porte 을 / 를.",
      forms.flatMap(recipient=>{
        const form=recipient.endsWith("에게")?"에게":recipient.endsWith("한테")?"한테":"께";
        return [p(form,self([recipient,[marked,obj],v])),p(form,self([[marked,obj],recipient,v]))];
      }),
      [[self([noun+"에서",[marked,obj],v]),"Le destinataire est une personne : emploie 에게, 한테 ou 께, pas le marqueur du lieu d’action."]]);
  }
  add("addition-home","addition","Je travaille aussi à la maison, en plus des autres lieux.","집 일하다","집에서도 일해요",
    "집 + 에서 + 도 : « aussi » porte sur le lieu. 집에서 일도 해요 ajouterait une activité, pas un lieu.",
    [p("에서도",self(["집에서도",e("일해요")]))],
    [[self(["집에서","일도",["해요","합니다","해"]]),"Tu ajoutes le travail aux autres activités. Ici, c’est la maison qui s’ajoute aux autres lieux : 집에서도."]]);
  add("addition-school","addition","J’étudie aussi à l’école, en plus des autres lieux.","학교 공부하다","학교에서도 공부해요",
    "학교 + 에서 + 도 : 도 s’attache au lieu déjà marqué par 에서.",
    [p("에서도",self(["학교에서도",e("공부해요")]))],
    [[self(["학교에서","공부도",["해요","합니다","해"]]),"공부도 ajoute une activité. La consigne ajoute un lieu : 학교에서도."]]);
  add("addition-friend","addition","Je donne un livre aussi à mon ami, en plus des autres personnes.","친구 책 주다","친구에게도 책을 줘요",
    "친구 + 에게 + 도 ajoute un destinataire. 책도 ajouterait un objet donné.",
    ["에게도","한테도"].flatMap(form=>[p(form,self(["친구"+form,["책을","책"],e("줘요")])),p(form,self([["책을","책"],"친구"+form,e("줘요")]))]),
    [[self([["친구에게","친구한테"],"책도",e("줘요")]),"책도 signifie « un livre aussi ». Ici, ajoute 도 au destinataire."]]);
  add("addition-coffee","addition","Je bois aussi du café, en plus des autres boissons.","커피 마시다","커피도 마셔요",
    "커피 + 도 ajoute le café. 도 prend ici la place de 를.",
    [p("도",self(["커피도",e("마셔요")]))],
    [[self(["커피만",e("마셔요")]),"만 restreint : « seulement du café ». Il faut ajouter le café aux autres boissons."]]);
  add("addition-bread","addition","J’achète aussi du pain, en plus des autres achats.","빵 사다","빵도 사요",
    "빵 + 도 : le pain s’ajoute aux autres achats.",
    [p("도",self(["빵도",e("사요")]))],
    [[self(["빵만",e("사요")]),"빵만 limite les achats au pain. Ici, le pain s’ajoute aux autres achats."]]);
  const only = [
    ["home","집 일하다","Je travaille uniquement à la maison.","집에서만 일해요",["집에서만",e("일해요")],["집에서밖에",["일하지 않아요","일하지 않습니다","일 안 해요"]],["집에서","일만",["해요","합니다","해"]],"만 porte sur le lieu : 집에서만. 일만 limiterait les activités au travail."],
    ["school","학교 공부하다","J’étudie uniquement à l’école.","학교에서만 공부해요",["학교에서만",e("공부해요")],["학교에서밖에",["공부하지 않아요","공부하지 않습니다","공부 안 해요"]],["학교에서","공부만",["해요","합니다","해"]],"학교에서만 limite les lieux d’étude. 공부만 limiterait les activités."],
    ["water","물 마시다","Je ne bois que de l’eau.","물만 마셔요",["물만",e("마셔요")],["물밖에",["마시지 않아요","마시지 않습니다","안 마셔요"]],["물도",e("마셔요")],"물만 limite les boissons à l’eau. 물도 ajouterait l’eau à d’autres boissons."],
    ["books","책 읽다","Je ne lis que des livres.","책만 읽어요",[["책만","책들만"],e("읽어요")],["책밖에",["읽지 않아요","읽지 않습니다","안 읽어요"]],["책도",e("읽어요")],"책만 limite ce qui est lu aux livres. 밖에 suivi d’une négation exprime aussi cette restriction."],
    ["friend","친구 책 주다","Je donne un livre uniquement à mon ami, à personne d’autre.","친구에게만 책을 줘요",[["친구에게만","친구한테만"],["책을","책"],e("줘요")],[["친구에게밖에","친구한테밖에"],["책을","책"],["주지 않아요","주지 않습니다","안 줘요"]],[["친구에게","친구한테"],"책만",e("줘요")],"친구에게만 limite les destinataires. 책만 limiterait les objets donnés aux livres."]
  ];
  for(const [id,needs,prompt,answer,yes,equivalent,no,explanation] of only)
    add("restriction-"+id,"restriction",prompt,needs,answer,explanation,
      [p("만",self(yes)),p("밖에 + négation",self(equivalent))],[[self(no),explanation]]);
  const ranges = [
    ["school","집 학교 걷다","Je marche de la maison jusqu’à l’école.","집","학교","걸어요","에서"],
    ["week","월요일 금요일 일하다","Je travaille du lundi au vendredi.","월요일","금요일","일해요","부터"],
    ["day","아침 저녁 공부하다","J’étudie du matin jusqu’au soir.","아침","저녁","공부해요","부터"],
    ["station","학교 역 걷다","Je marche de l’école jusqu’à la gare.","학교","역","걸어요","에서"],
    ["rest","오늘 내일 쉬다","Je me repose d’aujourd’hui jusqu’à demain.","오늘","내일","쉬어요","부터"]
  ];
  for(const [id,needs,prompt,from,to,v,start] of ranges)
    add("range-"+id,"range",prompt,needs,`${from}${start} ${to}까지 ${v}`,
      `${from}${start} marque le point de départ ; ${to}까지, la limite d’arrivée.`,
      [start,...(start==="에서"?["부터"]:[])].map(form=>p(form+"…까지",self([from+form,to+"까지",e(v)]))),
      [[self([from+"까지",to+start,e(v)]),"Les bornes sont inversées : 까지 marque l’arrivée, pas le départ."]]);
  const contrasts = [
    ["bag","가방 비싸다 가볍다","Le sac est cher, mais léger.",["가방은","가방이"],"비싸지만","비싼데",[],"가벼워요","비싸서"],
    ["restaurant","식당 작다 음식 맛있다","Le restaurant est petit, mais la nourriture est bonne.",["식당은","식당이"],"작지만","작은데",[["음식이","음식은"]],"맛있어요","작아서"],
    ["tired","피곤하다 일하다","Je suis fatigué, mais je travaille.",["","저는","제가","나는"],"피곤하지만","피곤한데",[],"일해요","피곤해서"],
    ["rain","비 오다 걷다","Il pleut, mais je marche.",["비가","비는"],"오지만","오는데",[],"걸어요","와서"],
    ["book","책 길다 재미있다","Le livre est long, mais intéressant.",["책은","책이"],"길지만","긴데",[],"재미있어요","길어서"]
  ];
  const contrastSentences={bag:["비싸요.","비쌉니다.","비싸."],restaurant:["작아요.","작습니다.","작아."],tired:["피곤해요.","피곤합니다.","피곤해."],rain:["와요.","옵니다.","와."],book:["길어요.","깁니다.","길어."]};
  for(const [id,needs,prompt,subject,a,b,tail,v,cause] of contrasts)
    add("contrast-"+id,"contrast",prompt,needs,[subject[0],a,...tail.map(x=>x[0]),v].filter(Boolean).join(" "),
      "지만 oppose les deux faits. 는데 / (으)ㄴ데 peut aussi introduire ce contraste. 아서 / 어서 exprimerait une cause.",
      [p("지만",[subject,a,...tail,e(v)]),p("는데/(으)ㄴ데",[subject,b,...tail,e(v)]),
        p("하지만 (deux phrases)",[subject,contrastSentences[id],"하지만",...tail,e(v)])],
      [[[subject,cause,...tail,e(v)],"Tu présentes le premier fait comme la cause du second. La consigne demande un contraste."]]);
  const conditions = [
    ["rain","비 오다 집 있다","S’il pleut, je reste à la maison.",["비가"],"오면",["집에"],"있어요","와서"],
    ["time","시간 있다 책 읽다","Si j’ai le temps, je lis un livre.",["시간이"],"있으면",[["책을","책"]],"읽어요","있어서"],
    ["hunger","배고프다 밥 먹다","Si j’ai faim, je mange.",["배가"],"고프면",[["","밥을","밥"]],"먹어요","고파서"],
    ["price","비싸다 사다","Si c’est cher, je n’achète pas.",[],"비싸면",[],"사지 않아요","비싸서"],
    ["cold","춥다 차 마시다","S’il fait froid, je bois du thé.",[],"추우면",[["차를","차"]],"마셔요","추워서"]
  ];
  for(const [id,needs,prompt,head,link,tail,v,cause] of conditions)
    add("condition-"+id,"condition",prompt,needs,[...head,link,...tail.map(sample),v].join(" "),
      "(으)면 pose une condition : « si… ». La situation n’est pas présentée comme une cause déjà réalisée.",
      [p("(으)면",self([...head,link,...tail,e(v)]))],
      [[self([...head,cause,...tail,e(v)]),"아서 / 어서 donne une cause. Ici, il faut poser une condition avec (으)면."]]);
  const purposes = [
    ["study","공부하다 도서관 가다","Je vais à la bibliothèque pour étudier.",[],"공부하려고","공부하러","도서관"],
    ["meal","밥 먹다 식당 가다","Je vais au restaurant pour manger.",[["","밥을","밥"]],"먹으려고","먹으러","식당"],
    ["friend","친구 만나다 카페 가다","Je vais au café pour rencontrer un ami.",[["친구를","친구"]],"만나려고","만나러","카페"],
    ["bread","빵 사다 가게 가다","Je vais au magasin pour acheter du pain.",[["빵을","빵"]],"사려고","사러","가게"],
    ["korean","한국어 배우다 학교 가다","Je vais à l’école pour apprendre le coréen.",[["한국어를","한국어"]],"배우려고","배우러","학교"]
  ];
  for(const [id,needs,prompt,obj,intent,motion,place] of purposes)
    add("purpose-"+id,"purpose",prompt,needs,[...obj.map(x=>x[0]||x[1]),intent,place+"에","가요"].join(" "),
      "(으)려고 exprime l’intention ; (으)러 exprime le but d’un déplacement. La destination porte 에 ou (으)로.",
      [p("(으)려고",self([...obj,intent,[place+"에",place+((place.charCodeAt(place.length-1)-0xac00)%28===0?"로":"으로")],e("가요")])),
        p("(으)러",self([...obj,motion,place+"에",e("가요")])),
        p("(으)러",self([place+"에",...obj,motion,e("가요")]))],
      [[self([...obj,intent,place+"에서",e("가요")]),"La consigne donne une destination, pas un lieu de départ : marque-la avec 에."]]);
  const simultaneous = [
    ["study","음악 듣다 공부하다","J’étudie en écoutant de la musique.",[["음악을","음악"]],"들으면서",[],"공부해요","듣고 나서"],
    ["walk","음악 듣다 걷다","Je marche en écoutant de la musique.",[["음악을","음악"]],"들으면서",[],"걸어요","듣고 나서"],
    ["television","텔레비전 보다 밥 먹다","Je mange en regardant la télévision.",[["텔레비전을","텔레비전","TV를","티비를"]],"보면서",[["","밥을","밥"]],"먹어요","보고 나서"],
    ["coffee","커피 마시다 책 읽다","Je lis un livre en buvant du café.",[["커피를","커피"]],"마시면서",[["책을","책"]],"읽어요","마시고 나서"],
    ["sing","걷다 노래 부르다","Je chante en marchant.",[],"걸으면서",[["노래를","노래"]],"불러요","걷고 나서"]
  ];
  for(const [id,needs,prompt,head,link,tail,v,after] of simultaneous)
    add("simultaneous-"+id,"simultaneous",prompt,needs,[...head.map(x=>x[0]),link,...tail.map(x=>x[0]||x[1]),v].join(" "),
      "(으)면서 relie deux actions simultanées du même sujet. 고 나서 signifie « après avoir… ».",
      [p("(으)면서",self([...head,link,...tail,e(v)]))],
      [[self([...head,after,...tail,e(v)]),"Tu places les actions l’une après l’autre. La consigne demande de les faire en même temps."]]);
  const modifiers = [
    ["reader","책 읽다 사람 친구","La personne qui lit un livre est mon ami.",[["책을","책"]],"읽는",["사람은","사람이"],[["제","내","저의","나의"]],"친구예요","읽어요"],
    ["cafe","일하다 카페 작다","Le café où je travaille est petit.",[["제가","내가"]],"일하는",["카페는","카페가"],[],"작아요","일해요"],
    ["child","빵 먹다 사람 아이","La personne qui mange du pain est un enfant.",[["빵을","빵"]],"먹는",["사람은","사람이"],[],"아이예요","먹어요"],
    ["friend","한국어 배우다 친구 여기 있다","L’ami qui apprend le coréen est ici.",[["한국어를","한국어"]],"배우는",["친구는","친구가"],["여기"],"있어요","배워요"],
    ["book","읽다 책 재미있다","Le livre que je lis est intéressant.",[["제가","내가"]],"읽는",["책은","책이"],[],"재미있어요","읽어요"]
  ];
  for(const [id,needs,prompt,head,link,noun,tail,v,finite] of modifiers)
    add("modifier-"+id,"modifier",prompt,needs,[...head.map(x=>x[0]),link,noun[0],...tail.map(x=>Array.isArray(x)?x[0]:x),v].join(" "),
      "Au présent, 는 attache l’action au nom qui suit : ce bloc précise de quelle personne ou chose on parle. Une terminaison en 요 terminerait la proposition.",
      [p("는 + nom",[...head,link,noun,...tail,e(v)])],
      [[[...head,finite,noun,...tail,e(v)],"La terminaison 요 coupe la phrase. Attache l’action au nom suivant avec 는."]]);
  const data = {version:1,goals,items};
  if(typeof module!=="undefined" && module.exports) module.exports=data;
  else root.SORI_PRODUCTION_DATA=data;
})(typeof globalThis!=="undefined"?globalThis:this);
