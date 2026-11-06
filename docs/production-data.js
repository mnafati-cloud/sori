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
    "공부해요":["공부해요","공부합니다","공부해","공부를 해요","공부를 합니다","공부를 해",
      "공부하고 있어요","공부하고 있습니다","공부하고 있어","공부를 하고 있어요","공부를 하고 있습니다","공부를 하고 있어"],
    "일해요":["일해요","일합니다","일해","일을 해요","일을 합니다","일을 해",
      "일하고 있어요","일하고 있습니다","일하고 있어","일을 하고 있어요","일을 하고 있습니다","일을 하고 있어"],
    "먹어요":["먹어요","먹습니다","먹어"], "읽어요":["읽어요","읽습니다","읽어"],
    "마셔요":["마셔요","마십니다","마셔"], "줘요":["줘요","주어요","줍니다","줘"],
    "보내요":["보내요","보냅니다","보내"], "드려요":["드려요","드립니다","드려"],
    "사요":["사요","삽니다","사"], "걸어요":["걸어요","걷습니다","걸어"],
    "쉬어요":["쉬어요","쉽니다","쉬어"], "가벼워요":["가벼워요","가볍습니다","가벼워"],
    "맛있어요":["맛있어요","맛있습니다","맛있어"], "재미있어요":["재미있어요","재밌어요","재미있습니다","재미있어"],
    "있어요":["있어요","있습니다","있어"], "사지 않아요":["사지 않아요","사지 않습니다","사지 않아","안 사요","안 삽니다","안 사"],
    "가요":["가요","갑니다","가"], "작아요":["작아요","작습니다","작아"],
    "친구예요":["친구예요","친구입니다","친구야"], "아이예요":["아이예요","아이입니다","아이야"],
    "불러요":["불러요","부릅니다","불러"], "들어요":["들어요","듣습니다","들어"],
    "걸어가요":["걸어가요","걸어갑니다","걸어가"],
    "노래해요":["노래해요","노래합니다","노래해","노래를 해요","노래를 합니다","노래를 해"]
  };
  // Formes finies relues : aucune conjugaison déduite automatiquement d’un radical.
  const actions = [
    ["먹어요","먹습니다","먹어","먹고"], ["읽어요","읽습니다","읽어","읽고"],
    ["줘요","줍니다","줘","주고"], ["드려요","드립니다","드려","드리고"],
    ["마셔요","마십니다","마셔","마시고"], ["사요","삽니다","사","사고"],
    ["걸어요","걷습니다","걸어","걷고"], ["쉬어요","쉽니다","쉬어","쉬고"],
    ["가요","갑니다","가","가고"], ["와요","옵니다","와","오고"],
    ["봐요","봅니다","봐","보고"], ["써요","씁니다","써","쓰고"],
    ["만나요","만납니다","만나","만나고"], ["기다려요","기다립니다","기다려","기다리고"],
    ["배워요","배웁니다","배워","배우고"], ["가르쳐요","가르칩니다","가르쳐","가르치고"],
    ["보내요","보냅니다","보내","보내고"], ["빌려줘요","빌려줍니다","빌려줘","빌려주고"],
    ["보여줘요","보여줍니다","보여줘","보여주고"], ["물어요","묻습니다","물어","묻고"],
    ["불러요","부릅니다","불러","부르고"], ["들어요","듣습니다","들어","듣고"],
    ["만들어요","만듭니다","만들어","만들고"], ["자요","잡니다","자","자고"],
    ["열어요","엽니다","열어","열고"], ["닫아요","닫습니다","닫아","닫고"],
    ["타요","탑니다","타","타고"], ["가져가요","가져갑니다","가져가","가져가고"]
  ];
  for(const [polite,formal,plain,ongoing] of actions)
    endings[polite]=[...new Set([...(endings[polite]||[]),polite,formal,plain,
      ongoing+" 있어요",ongoing+" 있습니다",ongoing+" 있어"])];
  for(const [noun,polite,formal,plain] of [
    ["요리","요리해요","요리합니다","요리해"], ["운동","운동해요","운동합니다","운동해"],
    ["청소","청소해요","청소합니다","청소해"], ["전화","전화해요","전화합니다","전화해"],
    ["여행","여행해요","여행합니다","여행해"], ["환전","환전해요","환전합니다","환전해"],
    ["메모","메모해요","메모합니다","메모해"], ["이야기","이야기해요","이야기합니다","이야기해"]
  ]) endings[polite]=[...new Set([polite,formal,plain,...["해요","합니다","해","하고 있어요","하고 있습니다","하고 있어"].flatMap(v=>[noun+v,noun+((noun.charCodeAt(noun.length-1)-0xac00)%28?"을 ":"를 ")+v])])];
  Object.assign(endings,{
    "해요":["해요","합니다","해","하고 있어요","하고 있습니다","하고 있어"],
    "말해요":["말해요","말합니다","말해","이야기해요","이야기합니다"],
    "깨끗해요":["깨끗해요","깨끗합니다","깨끗해"], "좋아요":["좋아요","좋습니다","좋아"],
    "어려워요":["어려워요","어렵습니다","어려워"], "비싸요":["비싸요","비쌉니다","비싸"],
    "길어요":["길어요","깁니다","길어"], "가까워요":["가까워요","가깝습니다","가까워"],
    "무거워요":["무거워요","무겁습니다","무거워"], "예뻐요":["예뻐요","예쁩니다","예뻐"],
    "커요":["커요","큽니다","커"], "선생님이에요":["선생님이에요","선생님입니다","선생님이야"],
    "똑똑해요":["똑똑해요","똑똑합니다","똑똑해"]
  });
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
  for(const [id,needs,prompt,from,to,v,start] of ranges){
    const last=v==="걸어요"?[...e(v),...e("걸어가요")]:e(v);
    add("range-"+id,"range",prompt,needs,`${from}${start} ${to}까지 ${v}`,
      `${from}${start} marque le point de départ ; ${to}까지, la limite d’arrivée.`,
      [start,...(start==="에서"?["부터"]:[])].flatMap(form=>[
        p(form+"…까지",self([from+form,to+"까지",last])),
        p(form+"…까지",[from+form,to+"까지",...self([last])]),
        p(form+"…까지",self([to+"까지",from+form,last]))
      ]),
      [[self([from+"까지",to+start,last]),"Les bornes sont inversées : 까지 marque l’arrivée, pas le départ."]]);
  }
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
    ["rain","비 오다 집 있다","S’il pleut, je reste à la maison.",[["비가","비"]],"오면",["집에"],"있어요","와서"],
    ["time","시간 있다 책 읽다","Si j’ai le temps, je lis un livre.",[["시간이","시간"]],"있으면",[["책을","책"]],"읽어요","있어서"],
    ["hunger","배고프다 밥 먹다","Si j’ai faim, je mange.",["배가"],"고프면",[["","밥을","밥"]],"먹어요","고파서"],
    ["price","비싸다 사다","Si c’est cher, je n’achète pas.",[],"비싸면",[],"사지 않아요","비싸서"],
    ["cold","춥다 차 마시다","S’il fait froid, je bois du thé.",[],"추우면",[["차를","차"]],"마셔요","추워서"]
  ];
  for(const [id,needs,prompt,head,link,tail,v,cause] of conditions)
    add("condition-"+id,"condition",prompt,needs,[...head.map(sample),link,...tail.map(sample),v].join(" "),
      "(으)면 pose une condition : « si… ». La situation n’est pas présentée comme une cause déjà réalisée.",
      [p("(으)면",self([...head,link,...tail,e(v)])),
        ...(id==="hunger"?[p("(으)면",self(["배고프면",...tail,e(v)]))]:[])],
      [[self([...head,cause,...tail,e(v)]),"아서 / 어서 donne une cause. Ici, il faut poser une condition avec (으)면."]]);
  const purposes = [
    ["study","공부하다 도서관 가다","Je vais à la bibliothèque pour étudier.",[],"공부하려고","공부하러","도서관"],
    ["meal","밥 먹다 식당 가다","Je vais au restaurant pour manger.",[["","밥을","밥"]],"먹으려고","먹으러","식당"],
    ["friend","친구 만나다 카페 가다","Je vais au café pour rencontrer un ami.",[["친구를","친구"]],"만나려고","만나러","카페"],
    ["bread","빵 사다 가게 가다","Je vais au magasin pour acheter du pain.",[["빵을","빵"]],"사려고","사러","가게"],
    ["korean","한국어 배우다 학교 가다","Je vais à l’école pour apprendre le coréen.",[["한국어를","한국어"]],"배우려고","배우러","학교"]
  ];
  for(const [id,needs,prompt,obj,intent,motion,place] of purposes){
    const destination=[place+"에",place+((place.charCodeAt(place.length-1)-0xac00)%28===0?"로":"으로")];
    const intentions=id==="study"?[intent,"공부를 하려고"]:[intent];
    const motions=id==="study"?[motion,"공부를 하러"]:[motion];
    add("purpose-"+id,"purpose",prompt,needs,[...obj.map(x=>x[0]||x[1]),intent,place+"에","가요"].join(" "),
      "(으)려고 exprime l’intention ; (으)러 exprime le but d’un déplacement. La destination porte 에 ou (으)로.",
      [p("(으)려고",self([...obj,intentions,destination,e("가요")])),
        p("(으)려고",self([destination,...obj,intentions,e("가요")])),
        p("(으)러",self([...obj,motions,destination,e("가요")])),
        p("(으)러",self([destination,...obj,motions,e("가요")]))],
      [[self([...obj,intent,place+"에서",e("가요")]),"La consigne donne une destination, pas un lieu de départ : marque-la avec 에."]]);
  }
  const simultaneous = [
    ["study","음악 듣다 공부하다","J’étudie en écoutant de la musique.",[["음악을","음악"]],"들으면서",[],"공부해요","듣고 나서"],
    ["walk","음악 듣다 걷다","Je marche en écoutant de la musique.",[["음악을","음악"]],"들으면서",[],"걸어요","듣고 나서"],
    ["television","텔레비전 보다 밥 먹다","Je mange en regardant la télévision.",[["텔레비전을","텔레비전","TV를","티비를"]],"보면서",[["","밥을","밥"]],"먹어요","보고 나서"],
    ["coffee","커피 마시다 책 읽다","Je lis un livre en buvant du café.",[["커피를","커피"]],"마시면서",[["책을","책"]],"읽어요","마시고 나서"],
    ["sing","걷다 노래 부르다","Je chante en marchant.",[],"걸으면서",[["노래를","노래"]],"불러요","걷고 나서"]
  ];
  // Inverser les deux actions conserve leur simultanéité, avec le même sujet.
  const simultaneousOther={
    study:[[],"공부하면서",[["음악을","음악"]],"들어요","공부하고 나서"],
    walk:[[],"걸으면서",[["음악을","음악"]],"들어요","걷고 나서"],
    television:[[["","밥을","밥"]],"먹으면서",[["텔레비전을","텔레비전","TV를","티비를"]],"봐요","먹고 나서"],
    coffee:[[["책을","책"]],"읽으면서",[["커피를","커피"]],"마셔요","읽고 나서"],
    sing:[[["노래를","노래"]],"부르면서",[],"걸어요","부르고 나서"]
  };
  for(const [id,needs,prompt,head,link,tail,v,after] of simultaneous){
    const [otherHead,otherLink,otherTail,otherVerb,otherAfter]=simultaneousOther[id];
    add("simultaneous-"+id,"simultaneous",prompt,needs,[...head.map(x=>x[0]),link,...tail.map(x=>x[0]||x[1]),v].join(" "),
      "(으)면서 relie deux actions simultanées du même sujet. 고 나서 signifie « après avoir… ».",
      [p("(으)면서",self([...head,link,...tail,e(v)])),
        p("(으)면서",self([...otherHead,otherLink,...otherTail,e(otherVerb)])),
        ...(id==="sing"?[p("(으)면서",self([link,e("노래해요")])),p("(으)면서",self(["노래하면서",e("걸어요")]))]:[])],
      [[self([...head,after,...tail,e(v)]),"Tu places les actions l’une après l’autre. La consigne demande de les faire en même temps."],
        [self([...otherHead,otherAfter,...otherTail,e(otherVerb)]),"고 나서 sépare les actions dans le temps. Ici, elles sont simultanées."]]);
  }
  const modifiers = [
    ["reader","책 읽다 사람 친구","La personne qui lit un livre est mon ami.",[["책을","책"]],"읽는",["사람은","사람이"],[["제","내","저의","나의"]],"친구예요","읽어요"],
    ["cafe","일하다 카페 작다","Le café où je travaille est petit.",[["제가","내가",""]],"일하는",["카페는","카페가"],[],"작아요","일해요"],
    ["child","빵 먹다 사람 아이","La personne qui mange du pain est un enfant.",[["빵을","빵"]],"먹는",["사람은","사람이"],[],"아이예요","먹어요"],
    ["friend","한국어 배우다 친구 여기 있다","L’ami qui apprend le coréen est ici.",[["한국어를","한국어"]],"배우는",["친구는","친구가"],[["여기","여기에"]],"있어요","배워요"],
    ["book","읽다 책 재미있다","Le livre que je lis est intéressant.",[["제가","내가",""]],"읽는",["책은","책이"],[],"재미있어요","읽어요"]
  ];
  const ongoing={"읽는":"읽고 있는","일하는":"일하고 있는","먹는":"먹고 있는","배우는":"배우고 있는"};
  for(const [id,needs,prompt,head,link,noun,tail,v,finite] of modifiers)
    add("modifier-"+id,"modifier",prompt,needs,[...head.map(x=>x[0]),link,noun[0],...tail.map(x=>Array.isArray(x)?x[0]:x),v].join(" "),
      "Au présent, 는 attache l’action au nom qui suit : ce bloc précise de quelle personne ou chose on parle. Une terminaison en 요 terminerait la proposition.",
      [p("는 + nom",[...head,[link,ongoing[link]],noun,...tail,e(v)])],
      [[[...head,finite,noun,...tail,e(v)],"La terminaison 요 coupe la phrase. Attache l’action au nom suivant avec 는."]]);
  // v199 : quinze contextes supplémentaires par objectif. Les particules restent
  // attachées à leur complément ; seuls les blocs relus peuvent changer d’ordre.
  const object = noun => [noun+((noun.charCodeAt(noun.length-1)-0xac00)%28 ? "을" : "를"),noun];
  const subject = noun => [noun+((noun.charCodeAt(noun.length-1)-0xac00)%28 ? "이" : "가"),noun+((noun.charCodeAt(noun.length-1)-0xac00)%28 ? "은" : "는")];
  const pair = (form,a,b,verb) => {
    const last=Array.isArray(verb)?verb:e(verb);
    return [p(form,self([a,b,last])),p(form,self([b,a,last]))];
  };
  const extraPlaces = [
    ["park-friend","공원 친구 만나다","Je rencontre un ami au parc.","공원","친구","만나요"],
    ["office-work","회사 일하다","Je travaille au bureau.","회사",null,"일해요"],
    ["kitchen-cook","부엌 요리하다","Je cuisine dans la cuisine.","부엌",null,"요리해요"],
    ["room-paper","방 신문 읽다","Je lis le journal dans ma chambre.","방","신문","읽어요"],
    ["hospital-work","병원 일하다","Je travaille à l’hôpital.","병원",null,"일해요"],
    ["shop-water","가게 물 사다","J’achète de l’eau au magasin.","가게","물","사요"],
    ["market-fruit","시장 과일 사다","J’achète des fruits au marché.","시장","과일","사요"],
    ["school-korean","학교 한국어 배우다","J’apprends le coréen à l’école.","학교","한국어","배워요"],
    ["home-tv","집 텔레비전 보다","Je regarde la télévision à la maison.","집","텔레비전","봐요"],
    ["library-study","도서관 공부하다","J’étudie à la bibliothèque.","도서관",null,"공부해요"],
    ["cafe-friend","카페 친구 만나다","Je rencontre un ami au café.","카페","친구","만나요"],
    ["park-walk","공원 걷다","Je marche dans le parc.","공원",null,"걸어요"],
    ["home-exercise","집 운동하다","Je fais du sport à la maison.","집",null,"운동해요"],
    ["room-letter","방 편지 쓰다","J’écris une lettre dans ma chambre.","방","편지","써요"],
    ["school-lunch","학교 점심 먹다","Je déjeune à l’école.","학교","점심","먹어요"]
  ];
  for(const [id,needs,prompt,place,obj,verb] of extraPlaces){
    const tail=obj?[object(obj),e(verb)]:[e(verb)];
    add("place-"+id,"place",prompt,needs,[place+"에서",...tail.map(sample)].join(" "),
      "에서 s’attache au lieu où se déroule l’action. Le complément peut précéder ou suivre l’objet.",
      obj?pair("에서",place+"에서",object(obj),verb):[p("에서",self([place+"에서",e(verb)]))],
      [[self([place+"에",...tail]),"Pour situer cette action, attache 에서 au lieu."]]);
  }
  const extraRecipients = [
    ["teacher-question","선생님 질문 하다","Je pose une question au professeur.","선생님","질문","해요",true],
    ["friend-photo","친구 사진 보내다","J’envoie une photo à un ami.","친구","사진","보내요"],
    ["sibling-book","동생 책 빌려주다","Je prête un livre à mon petit frère ou à ma petite sœur.","동생","책","빌려줘요"],
    ["child-korean","아이 한국어 가르치다","J’enseigne le coréen à un enfant.","아이","한국어","가르쳐요"],
    ["mother-water","어머니 물 주다","Je donne de l’eau à ma mère.","어머니","물","줘요",true],
    ["friend-name","친구 이름 말하다","Je dis mon nom à un ami.","친구","이름","말해요"],
    ["father-letter","아버지 편지 보내다","J’envoie une lettre à mon père.","아버지","편지","보내요",true],
    ["teacher-gift","선생님 선물 주다","Je donne un cadeau au professeur.","선생님","선물","줘요",true],
    ["friend-coffee","친구 커피 주다","Je donne du café à un ami.","친구","커피","줘요"],
    ["child-bread","아이 빵 주다","Je donne du pain à un enfant.","아이","빵","줘요"],
    ["mother-photo","어머니 사진 보내다","J’envoie une photo à ma mère.","어머니","사진","보내요",true],
    ["sibling-message","동생 메시지 보내다","J’envoie un message à mon petit frère ou à ma petite sœur.","동생","메시지","보내요"],
    ["friend-call","친구 전화하다","Je téléphone à un ami.","친구",null,"전화해요"],
    ["father-question","아버지 질문 하다","Je pose une question à mon père.","아버지","질문","해요",true],
    ["teacher-email","선생님 이메일 보내다","J’envoie un courriel au professeur.","선생님","이메일","보내요",true]
  ];
  for(const [id,needs,prompt,person,obj,verb,respect] of extraRecipients){
    const marks=respect?["에게","한테","께"]:["에게","한테"];
    const verbs=respect&&verb==="줘요"?[...e(verb),...e("드려요")]:e(verb);
    const tail=obj?[object(obj),verbs]:[verbs];
    add("recipient-"+id,"recipient",prompt,needs,[person+(respect?"께":"에게"),...tail.map(sample)].join(" "),
      "에게 / 한테 désignent la personne à qui l’action s’adresse ; 께 est respectueux. Le destinataire reste distinct de l’objet.",
      marks.flatMap(mark=>[p(mark,self([person+mark,...tail])),...(obj?[p(mark,self([object(obj),person+mark,verbs]))]:[]),
        ...(obj==="질문"?[p(mark,self([person+mark,["질문해요","질문합니다","질문해","질문하고 있어요"]])),
          p(mark,self([person+mark,object(obj),e("물어요")])),p(mark,self([object(obj),person+mark,e("물어요")]))]:[])]),
      [[self([person+"에서",...tail]),"에서 situe une action dans un lieu ; ici, il faut désigner la personne destinataire."]]);
  }
  // Portée de 도 : objet, sujet, lieu, moment ou destinataire, selon la consigne.
  const extraAdditions = [
    ["water","물 마시다","Je bois aussi de l’eau, en plus des autres boissons.","물","object","마셔요"],
    ["fruit","과일 먹다","Je mange aussi des fruits, en plus des autres aliments.","과일","object","먹어요"],
    ["paper","신문 읽다","Je lis aussi le journal, en plus des autres lectures.","신문","object","읽어요"],
    ["movie","영화 보다","Je regarde aussi des films, en plus des autres programmes.","영화","object","봐요"],
    ["books","책 사다","J’achète aussi des livres, en plus des autres achats.","책","object","사요"],
    ["friend-subject","친구 공부하다","Mon ami aussi étudie, comme les autres personnes.","친구","subject","공부해요"],
    ["mother-subject","어머니 일하다","Ma mère aussi travaille, comme les autres personnes.","어머니","subject","일해요"],
    ["sibling-subject","동생 오다","Mon petit frère ou ma petite sœur vient aussi, comme les autres personnes.","동생","subject","와요"],
    ["library","도서관 책 읽다","Je lis un livre aussi à la bibliothèque, en plus des autres lieux.","도서관","place","읽어요","책"],
    ["office","회사 커피 마시다","Je bois du café aussi au bureau, en plus des autres lieux.","회사","place","마셔요","커피"],
    ["park","공원 친구 만나다","Je rencontre un ami aussi au parc, en plus des autres lieux.","공원","place","만나요","친구"],
    ["today","오늘 일하다","Je travaille aujourd’hui aussi, comme les autres jours.","오늘","time","일해요"],
    ["weekend","주말 공부하다","J’étudie aussi le week-end, en plus des autres jours.","주말","time","공부해요"],
    ["mother","어머니 편지 보내다","J’envoie une lettre aussi à ma mère, en plus des autres destinataires.","어머니","recipient","보내요","편지"],
    ["teacher","선생님 선물 주다","Je donne un cadeau aussi au professeur, en plus des autres destinataires.","선생님","recipient","줘요","선물"]
  ];
  for(const [id,needs,prompt,noun,scope,verb,obj] of extraAdditions){
    const suffixes=scope==="place"?["에서도"]:scope==="recipient"?["에게도","한테도","께도"]:scope==="time"&&noun!=="오늘"?["에도","도"]:["도"];
    const last=scope==="recipient"&&verb==="줘요"?[...e(verb),...e("드려요")]:e(verb);
    const yes=suffixes.flatMap(form=>obj?pair(form,noun+form,object(obj),last):[p(form,scope==="subject"?[noun+form,last]:self([noun+form,last]))]);
    add("addition-"+id,"addition",prompt,needs,[noun+suffixes[0],...(obj?[object(obj)[0]]:[]),verb].join(" "),
      `도 ajoute ${noun} aux autres éléments de même rôle. Il doit rester attaché au ${scope==="subject"?"sujet":scope==="place"?"lieu":scope==="recipient"?"destinataire":scope==="time"?"moment":"complément d’objet"} visé par « aussi ».`,yes);
  }
  // 만 et 밖에 + négation expriment la même restriction, sans déplacer sa portée.
  const extraRestrictions = [
    ["coffee","커피 마시다","Je ne bois que du café.","커피","object","마셔요",["마시지 않아요","마시지 않습니다","안 마셔요"]],
    ["fruit","과일 먹다","Je ne mange que des fruits.","과일","object","먹어요",["먹지 않아요","먹지 않습니다","안 먹어요"]],
    ["paper","신문 읽다","Je ne lis que le journal.","신문","object","읽어요",["읽지 않아요","읽지 않습니다","안 읽어요"]],
    ["movie","영화 보다","Je ne regarde que des films.","영화","object","봐요",["보지 않아요","보지 않습니다","안 봐요"]],
    ["bread","빵 사다","Je n’achète que du pain.","빵","object","사요",["사지 않아요","사지 않습니다","안 사요"]],
    ["friend-subject","친구 공부하다","Seul mon ami étudie ; les autres personnes n’étudient pas.","친구","subject","공부해요",["공부하지 않아요","공부하지 않습니다","공부 안 해요"]],
    ["mother-subject","어머니 일하다","Seule ma mère travaille ; les autres personnes ne travaillent pas.","어머니","subject","일해요",["일하지 않아요","일하지 않습니다","일 안 해요"]],
    ["sibling-subject","동생 오다","Seul mon petit frère ou ma petite sœur vient ; les autres personnes ne viennent pas.","동생","subject","와요",["오지 않아요","오지 않습니다","안 와요"]],
    ["library","도서관 책 읽다","Je lis des livres uniquement à la bibliothèque.","도서관","place","읽어요",["읽지 않아요","읽지 않습니다","안 읽어요"],"책"],
    ["office","회사 커피 마시다","Je bois du café uniquement au bureau.","회사","place","마셔요",["마시지 않아요","마시지 않습니다","안 마셔요"],"커피"],
    ["park","공원 친구 만나다","Je rencontre un ami uniquement au parc.","공원","place","만나요",["만나지 않아요","만나지 않습니다","안 만나요"],"친구"],
    ["today","오늘 일하다","Je travaille seulement aujourd’hui, aucun autre jour.","오늘","time","일해요",["일하지 않아요","일하지 않습니다","일 안 해요"]],
    ["weekend","주말 공부하다","J’étudie seulement le week-end, pas les autres jours.","주말","time","공부해요",["공부하지 않아요","공부하지 않습니다","공부 안 해요"]],
    ["mother","어머니 편지 보내다","J’envoie une lettre uniquement à ma mère, à personne d’autre.","어머니","recipient","보내요",["보내지 않아요","보내지 않습니다","안 보내요"],"편지"],
    ["teacher","선생님 선물 주다","Je donne un cadeau uniquement au professeur, à personne d’autre.","선생님","recipient","줘요",["주지 않아요","주지 않습니다","안 줘요"],"선물"]
  ];
  for(const [id,needs,prompt,noun,scope,verb,negative,obj] of extraRestrictions){
    const suffixes=scope==="place"?["에서"]:scope==="recipient"?["에게","한테","께"]:scope==="time"&&noun!=="오늘"?["에",""]:[""];
    const wrap=parts=>scope==="subject"?parts:self(parts);
    const last=scope==="recipient"&&verb==="줘요"?[...e(verb),...e("드려요")]:e(verb);
    const no=scope==="recipient"&&verb==="줘요"?[...negative,"드리지 않아요","드리지 않습니다","안 드려요"]:negative;
    const rules=suffixes.flatMap(suffix=>[p("만",wrap([noun+suffix+"만",...(obj?[object(obj)]:[]),last])),
      p("밖에 + négation",wrap([noun+suffix+"밖에",...(obj?[object(obj)]:[]),no])),
      ...(obj?[p("만",self([object(obj),noun+suffix+"만",last])),p("밖에 + négation",self([object(obj),noun+suffix+"밖에",no]))]:[])]);
    add("restriction-"+id,"restriction",prompt,needs,[noun+suffixes[0]+"만",...(obj?[object(obj)[0]]:[]),verb].join(" "),
      `만 limite la phrase à ${noun}. 밖에 exprime aussi « seulement », mais exige une négation. Changer l’endroit où ces particules s’attachent change ce qui est limité.`,rules);
  }
  const extraRanges = [
    ["school-home","학교 집 걷다","Je marche de l’école jusqu’à la maison.","학교","집","걸어요","에서"],
    ["library-cafe","도서관 카페 걷다","Je marche de la bibliothèque jusqu’au café.","도서관","카페","걸어요","에서"],
    ["office-home","회사 집 걷다","Je marche du bureau jusqu’à la maison.","회사","집","걸어요","에서"],
    ["station-market","역 시장 걷다","Je marche de la gare jusqu’au marché.","기차역","시장","걸어요","에서"],
    ["shop-park","가게 공원 걷다","Je marche du magasin jusqu’au parc.","가게","공원","걸어요","에서"],
    ["morning-noon","아침 점심 기다리다","J’attends du matin jusqu’à midi.","아침","점심","기다려요","부터"],
    ["noon-evening","점심 저녁 공부하다","J’étudie de midi jusqu’au soir.","점심","저녁","공부해요","부터"],
    ["monday-thursday","월요일 목요일 일하다","Je travaille du lundi au jeudi.","월요일","목요일","일해요","부터"],
    ["tuesday-friday","화요일 금요일 공부하다","J’étudie du mardi au vendredi.","화요일","금요일","공부해요","부터"],
    ["today-weekend","오늘 주말 일하다","Je travaille d’aujourd’hui jusqu’au week-end.","오늘","주말","일해요","부터"],
    ["stop-station","정류장 역 걷다","Je marche de l’arrêt de bus jusqu’à la gare.","정류장","기차역","걸어요","에서"],
    ["park-hospital","공원 병원 걷다","Je marche du parc jusqu’à l’hôpital.","공원","병원","걸어요","에서"],
    ["library-school","도서관 학교 걷다","Je marche de la bibliothèque jusqu’à l’école.","도서관","학교","걸어요","에서"],
    ["monday-wednesday","월요일 수요일 공부하다","J’étudie du lundi au mercredi.","월요일","수요일","공부해요","부터"],
    ["evening-night","저녁 밤 일하다","Je travaille du soir jusque dans la nuit.","저녁","밤","일해요","부터"]
  ];
  for(const [id,needs,prompt,from,to,verb,start] of extraRanges){
    const last=verb==="걸어요"?[...e(verb),...e("걸어가요")]:e(verb);
    add("range-"+id,"range",prompt,needs,`${from}${start} ${to}까지 ${verb}`,
      `${from}${start} indique le départ ; ${to}까지 indique la limite. Pour un trajet, 에서 et 부터 peuvent marquer le départ ; pour le temps, on emploie 부터.`,
      (start==="에서"?["에서","부터"]:["부터"]).flatMap(mark=>[p(mark+"…까지",self([from+mark,to+"까지",last])),p(mark+"…까지",self([to+"까지",from+mark,last]))]),
      [[self([from+"까지",to+start,last]),"까지 marque la limite finale. Les deux bornes sont inversées."]]);
  }
  const extraContrasts = [
    ["cold-walk","춥다 걷다","Il fait froid, mais je marche.",[],"춥지만","추운데",[],"걸어요"],
    ["hot-work","덥다 일하다","Il fait chaud, mais je travaille.",[],"덥지만","더운데",[],"일해요"],
    ["busy-read","바쁘다 책 읽다","Je suis occupé, mais je lis un livre.",[],"바쁘지만","바쁜데",[object("책")],"읽어요"],
    ["korean","한국어 어렵다 재미있다","Le coréen est difficile, mais intéressant.",[subject("한국어")],"어렵지만","어려운데",[],"재미있어요"],
    ["far-school","학교 멀다 가다","L’école est loin, mais j’y vais.",[subject("학교")],"멀지만","먼데",[["","학교에"]],"가요"],
    ["spicy-food","음식 맵다 맛있다","La nourriture est épicée, mais bonne.",[subject("음식")],"맵지만","매운데",[],"맛있어요"],
    ["small-room","방 작다 깨끗하다","La chambre est petite, mais propre.",[subject("방")],"작지만","작은데",[],"깨끗해요"],
    ["buy-book","책 비싸다 사다","Le livre est cher, mais je l’achète.",[subject("책")],"비싸지만","비싼데",[["","책을","책"]],"사요"],
    ["bitter-coffee","커피 쓰다:amer 맛있다","Le café est amer, mais bon.",[subject("커피")],"쓰지만","쓴데",[],"맛있어요"],
    ["rain-friend","비 오다 친구 오다","Il pleut, mais mon ami vient.",[["비가","비"]],"오지만","오는데",[subject("친구")],"와요"],
    ["no-time","시간 없다 공부하다","Je n’ai pas le temps, mais j’étudie.",[["시간이","시간은","시간"]],"없지만","없는데",[],"공부해요"],
    ["exercise","피곤하다 운동하다","Je suis fatigué, mais je fais du sport.",[],"피곤하지만","피곤한데",[],"운동해요"],
    ["large-bag","가방 크다 가볍다","Le sac est grand, mais léger.",[subject("가방")],"크지만","큰데",[],"가벼워요"],
    ["clothes","옷 예쁘다 비싸다","Les vêtements sont beaux, mais chers.",[subject("옷")],"예쁘지만","예쁜데",[],"비싸요"],
    ["movie","영화 길다 재미있다","Le film est long, mais intéressant.",[subject("영화")],"길지만","긴데",[],"재미있어요"]
  ];
  for(const [id,needs,prompt,head,contrast,background,tail,verb] of extraContrasts)
    add("contrast-"+id,"contrast",prompt,needs,[...head.map(sample),contrast,...tail.map(sample),verb].filter(Boolean).join(" "),
      "지만 relie deux faits qui contrastent. 는데 / (으)ㄴ데 peut présenter le premier fait comme arrière-plan du contraste.",
      [p("지만",[...head,contrast,...tail,e(verb)]),p("는데/(으)ㄴ데",[...head,background,...tail,e(verb)]),
        ...(!head.length?[p("지만",self([contrast,...tail,e(verb)])),p("는데/(으)ㄴ데",self([background,...tail,e(verb)]))]:[])]);
  const extraConditions = [
    ["bread","배고프다 빵 먹다","Si j’ai faim, je mange du pain.",[],["배고프면","배가 고프면"],[object("빵")],"먹어요"],
    ["thirst","목마르다 물 마시다","Si j’ai soif, je bois de l’eau.",[],["목마르면","목이 마르면"],[object("물")],"마셔요"],
    ["tired-rest","피곤하다 쉬다","Si je suis fatigué, je me repose.",[],"피곤하면",[],"쉬어요"],
    ["work-finished","일 끝나다 집 가다","Quand le travail est terminé, je rentre à la maison.",[["일이","일"]],"끝나면",["집에"],"가요"],
    ["rain-umbrella","비 오다 우산 가져가다","S’il pleut, j’emporte un parapluie.",[["비가","비"]],"오면",[object("우산")],"가져가요"],
    ["snow","눈:neige 오다 집 있다","S’il neige, je reste à la maison.",[["눈이","눈"]],"오면",["집에"],"있어요"],
    ["cheap","싸다 사다","Si c’est bon marché, j’achète.",[],"싸면",[],"사요"],
    ["money","돈 있다 여행 하다","Si j’ai de l’argent, je voyage.",[["돈이","돈"]],"있으면",[],"여행해요"],
    ["weather","날씨 좋다 걷다","S’il fait beau, je marche.",[["날씨가","날씨"]],"좋으면",[],"걸어요"],
    ["friend-cook","친구 오다 요리하다","Si mon ami vient, je cuisine.",[["친구가","친구"]],"오면",[],"요리해요"],
    ["cold-window","춥다 창문 닫다","S’il fait froid, je ferme la fenêtre.",[],"추우면",[object("창문")],"닫아요"],
    ["hot-window","덥다 창문 열다","S’il fait chaud, j’ouvre la fenêtre.",[],"더우면",[object("창문")],"열어요"],
    ["bus","버스 오다 타다","Si le bus arrive, je monte dedans.",[["버스가","버스"]],"오면",[["","버스를","버스"]],"타요"],
    ["arrival-call","도착하다 친구 전화하다","Quand j’arrive, je téléphone à un ami.",[],"도착하면",[["친구에게","친구한테"]],"전화해요"],
    ["unknown-question","모르다 선생님 묻다","Si je ne sais pas, je demande au professeur.",[],"모르면",[["선생님께","선생님에게","선생님한테"]],"물어요"]
  ];
  for(const [id,needs,prompt,head,condition,tail,verb] of extraConditions)
    add("condition-"+id,"condition",prompt,needs,[...head.map(sample),sample(condition),...tail.map(sample),verb].filter(Boolean).join(" "),
      "(으)면 présente la condition sous laquelle l’action suivante a lieu : « si… » ou « quand… » dans cette situation habituelle.",
      [p("(으)면",[...head,condition,...self([...tail,e(verb)])]),
        ...(!head.length||["bread","thirst","money","work-finished"].includes(id)?[p("(으)면",self([...head,condition,...tail,e(verb)]))]:[])]);
  const extraPurposes = [
    ["doctor","병원 의사 만나다","Je vais à l’hôpital pour rencontrer un médecin.","병원","의사","만나려고","만나러"],
    ["park","공원 걷다","Je vais au parc pour marcher.","공원",null,"걸으려고","걸으러"],
    ["water","가게 물 사다","Je vais au magasin pour acheter de l’eau.","가게","물","사려고","사러"],
    ["letter","우체국 편지 보내다","Je vais à la poste pour envoyer une lettre.","우체국","편지","보내려고","보내러"],
    ["bank","은행 환전하다","Je vais à la banque pour changer de l’argent.","은행",null,["환전하려고","환전을 하려고"],["환전하러","환전을 하러"]],
    ["bookshop","서점 책 사다","Je vais à la librairie pour acheter un livre.","서점","책","사려고","사러"],
    ["teacher","학교 선생님 만나다","Je vais à l’école pour rencontrer le professeur.","학교","선생님","만나려고","만나러"],
    ["coffee","카페 커피 마시다","Je vais au café pour boire du café.","카페","커피","마시려고","마시러"],
    ["read","도서관 책 읽다","Je vais à la bibliothèque pour lire un livre.","도서관","책","읽으려고","읽으러"],
    ["rest","집 쉬다","Je vais à la maison pour me reposer.","집",null,"쉬려고","쉬러"],
    ["cook","부엌 요리하다","Je vais dans la cuisine pour cuisiner.","부엌",null,["요리하려고","요리를 하려고"],["요리하러","요리를 하러"]],
    ["fruit","시장 과일 사다","Je vais au marché pour acheter des fruits.","시장","과일","사려고","사러"],
    ["gym","체육관 운동하다","Je vais au gymnase pour faire du sport.","체육관",null,["운동하려고","운동을 하려고"],["운동하러","운동을 하러"]],
    ["station-friend","역 친구 만나다","Je vais à la gare pour rencontrer un ami.","기차역","친구","만나려고","만나러"],
    ["sleep","방 자다","Je vais dans ma chambre pour dormir.","방",null,"자려고","자러"]
  ];
  for(const [id,needs,prompt,place,obj,intent,motion] of extraPurposes){
    const jong=(place.charCodeAt(place.length-1)-0xac00)%28;
    const destination=[place+"에",place+(jong&&jong!==8?"으로":"로")];
    add("purpose-"+id,"purpose",prompt,needs,[...(obj?[object(obj)[0]]:[]),sample(motion),destination[0],"가요"].join(" "),
      "(으)러 marque le but d’un déplacement ; (으)려고 exprime l’intention. La destination porte 에 ou (으)로, pas 에서.",
      [["(으)러",motion],["(으)려고",intent]].flatMap(([form,link])=>[
        p(form,self([...(obj?[object(obj)]:[]),link,destination,e("가요")])),
        p(form,self([destination,...(obj?[object(obj)]:[]),link,e("가요")]))]));
  }
  const extraSimultaneous = [
    ["meal-paper","밥 먹다 신문 읽다","Je lis le journal en mangeant.",[object("밥")],"먹으면서",[object("신문")],"읽어요","읽으면서","먹어요"],
    ["wait-read","기다리다 책 읽다","Je lis un livre en attendant.",[],"기다리면서",[object("책")],"읽어요","읽으면서","기다려요"],
    ["cook-music","요리하다 음악 듣다","Je cuisine en écoutant de la musique.",[object("음악")],"들으면서",[],"요리해요",["요리하면서","요리를 하면서"],"들어요"],
    ["clean-music","청소하다 음악 듣다","Je fais le ménage en écoutant de la musique.",[object("음악")],"들으면서",[],"청소해요",["청소하면서","청소를 하면서"],"들어요"],
    ["tea-tv","차 마시다 텔레비전 보다","Je regarde la télévision en buvant du thé.",[object("차")],"마시면서",[object("텔레비전")],"봐요","보면서","마셔요"],
    ["talk-walk","말하다 걷다","Je marche en parlant.",[],["말하면서","이야기하면서","이야기를 하면서"],[],"걸어요","걸으면서","말해요"],
    ["work-coffee","일하다 커피 마시다","Je travaille en buvant du café.",[object("커피")],"마시면서",[],"일해요",["일하면서","일을 하면서"],"마셔요"],
    ["sport-music","운동하다 음악 듣다","Je fais du sport en écoutant de la musique.",[object("음악")],"들으면서",[],"운동해요",["운동하면서","운동을 하면서"],"들어요"],
    ["bread-movie","빵 먹다 영화 보다","Je regarde un film en mangeant du pain.",[object("빵")],"먹으면서",[object("영화")],"봐요","보면서","먹어요"],
    ["study-water","공부하다 물 마시다","J’étudie en buvant de l’eau.",[object("물")],"마시면서",[],"공부해요",["공부하면서","공부를 하면서"],"마셔요"],
    ["korean-notes","한국어 배우다 메모 하다","Je prends des notes en apprenant le coréen.",[object("한국어")],"배우면서",[],"메모해요",["메모하면서","메모를 하면서"],"배워요"],
    ["book-notes","책 읽다 메모 하다","Je prends des notes en lisant un livre.",[object("책")],"읽으면서",[],"메모해요",["메모하면서","메모를 하면서"],"읽어요"],
    ["sing-cook","노래 부르다 요리하다","Je cuisine en chantant.",[object("노래")],"부르면서",[],"요리해요",["요리하면서","요리를 하면서"],"불러요"],
    ["walk-call","걷다 전화하다","Je téléphone en marchant.",[],"걸으면서",[],"전화해요",["전화하면서","전화를 하면서"],"걸어요"],
    ["rest-music","쉬다 음악 듣다","Je me repose en écoutant de la musique.",[object("음악")],"들으면서",[],"쉬어요","쉬면서","들어요"]
  ];
  for(const [id,needs,prompt,head,link,tail,verb,otherLink,otherVerb] of extraSimultaneous)
    add("simultaneous-"+id,"simultaneous",prompt,needs,[...head.map(sample),sample(link),...tail.map(sample),verb].join(" "),
      "(으)면서 relie deux actions faites en même temps par la même personne. On peut inverser leur ordre, en gardant chaque objet avec son action.",
      [p("(으)면서",self([...head,link,...tail,e(verb)])),p("(으)면서",self([...tail,otherLink,...head,e(otherVerb)]))]);
  const extraModifiers = [
    ["coffee-person","커피 마시다 사람 선생님","La personne qui boit du café est le professeur.",[object("커피")],"마시는","마시고 있는","사람",[],"선생님이에요"],
    ["hospital-friend","병원 일하다 사람 친구","La personne qui travaille à l’hôpital est mon ami.",["병원에서"],"일하는","일하고 있는","사람",[["제","내","저의","나의"]],"친구예요"],
    ["bread-buy","사다 빵 맛있다","Le pain que j’achète est bon.",[["제가","내가",""]],"사는","사고 있는","빵",[],"맛있어요"],
    ["watch-movie","보다 영화 재미있다","Le film que je regarde est intéressant.",[["제가","내가",""]],"보는","보고 있는","영화",[],"재미있어요"],
    ["mother-food","어머니 만들다 음식 맛있다","La nourriture que ma mère prépare est bonne.",[["어머니가","엄마가"]],"만드는","만들고 있는","음식",[],"맛있어요"],
    ["friend-music","친구 듣다 음악 좋다","La musique que mon ami écoute est bien.",[["친구가"]],"듣는","듣고 있는","음악",[],"좋아요"],
    ["study-room","공부하다 방 작다","La chambre où j’étudie est petite.",[["제가","내가",""]],"공부하는","공부하고 있는","방",[],"작아요"],
    ["work-place","친구 일하다 곳 가깝다","L’endroit où mon ami travaille est proche.",[["친구가"]],"일하는","일하고 있는","곳",[],"가까워요"],
    ["child-bag","아이 들다 가방 무겁다","Le sac que l’enfant porte est lourd.",[["아이가"]],"드는","들고 있는","가방",[],"무거워요"],
    ["teacher-book","선생님 읽다 책 어렵다","Le livre que le professeur lit est difficile.",[["선생님이"]],"읽는","읽고 있는","책",[],"어려워요"],
    ["waiting-person","기다리다 사람 친구","La personne qui attend est mon ami.",[],"기다리는","기다리고 있는","사람",[["제","내","저의","나의"]],"친구예요"],
    ["school-child","학교 가다 아이","La personne qui va à l’école est un enfant.",["학교에"],"가는","가고 있는","사람",[],"아이예요"],
    ["mother-clothes","어머니 사다 옷 예쁘다","Les vêtements que ma mère achète sont beaux.",[["어머니가","엄마가"]],"사는","사고 있는","옷",[],"예뻐요"],
    ["korean-child","한국어 배우다 아이 똑똑하다","L’enfant qui apprend le coréen est intelligent.",[object("한국어")],"배우는","배우고 있는","아이",[],"똑똑해요"],
    ["write-letter","쓰다 편지 길다","La lettre que j’écris est longue.",[["제가","내가",""]],"쓰는","쓰고 있는","편지",[],"길어요"]
  ];
  for(const [id,needs,prompt,head,link,ongoing,noun,tail,verb] of extraModifiers)
    add("modifier-"+id,"modifier",prompt,needs,[...head.map(sample),link,subject(noun)[0],...tail.map(sample),verb].join(" "),
      `La proposition en 는 précède ${noun} pour préciser de qui ou de quoi on parle. 고 있는 souligne l’action en cours. Une terminaison en 요 ne peut pas remplacer cette liaison devant le nom.`,
      [p("는 + nom",[...head,[link,ongoing],subject(noun),...tail,e(verb)])]);
  // Variantes de phrases entières pour les anciens contextes aussi.
  for(const [id,needs,prompt,head,link,tail,verb] of conditions)
    items.find(x=>x.id==="condition-"+id).accept.push(p("(으)면",[...head,link,...self([...tail,e(verb)])]));
  const friendOnly=items.find(x=>x.id==="restriction-friend");
  friendOnly.accept.push(p("만",self([object("책"),["친구에게만","친구한테만"],e("줘요")])),
    p("밖에 + négation",self([object("책"),["친구에게밖에","친구한테밖에"],["주지 않아요","주지 않습니다","안 줘요"]])));
  items.find(x=>x.id==="modifier-teacher-book").accept.push(p("는 + nom",[["선생님이","선생님께서"],["읽으시는","읽고 계시는"],subject("책"),e("어려워요")]));

  // Substitutions lexicales limitées à des blocs déclarés, particules comprises.
  // Aucune suppression générale des espaces ni reconnaissance par mots-clés.
  const blocks={
    "텔레비전":["텔레비전","TV","티비"],"텔레비전을":["텔레비전을","TV를","티비를"],
    "한국어":["한국어","한국말"],"한국어를":["한국어를","한국말을"],
    "빌려줘요":["빌려줘요","빌려 줘요"],"빌려줍니다":["빌려줍니다","빌려 줍니다"],
    "물어요":["물어요","물어봐요","물어 봐요"],"묻습니다":["묻습니다","물어봅니다","물어 봅니다"]
  };
  function blockVariants(text){
    if(blocks[text]) return blocks[text];
    for(const [a,b] of [["기차역","역"],["역","기차역"],["어머니","엄마"],["아버지","아빠"],["이메일","메일"]])
      if(text===a||["에","에서","부터","까지","으로","은","이","에게","한테","께","에게도","한테도","께도","에게만","한테만","께만","에게밖에","한테밖에","께밖에","가","는","도","만","밖에","을"].some(s=>text===a+s))
        return [text,b+text.slice(a.length)];
    return [text];
  }
  const personal=["","저는","제가","나는","내가"];
  for(const item of items){
    if(["place","recipient","addition","restriction","range","purpose"].includes(item.goal)){
      // Le sujet peut aussi suivre les compléments d’une même proposition.
      const extra=item.accept.filter(r=>Array.isArray(r.parts[0])&&JSON.stringify(r.parts[0])===JSON.stringify(personal)&&r.parts.length>2)
        .map(r=>p(r.form,[...r.parts.slice(1,-1),personal,r.parts.at(-1)]));
      item.accept.push(...extra);
    }
    for(const rule of [...item.accept,...item.wrong]) rule.parts=rule.parts.map(part=>{
      const variants=[...new Set((Array.isArray(part)?part:[part]).flatMap(blockVariants))];
      return variants.length===1?variants[0]:variants;
    });
  }
  // Sens relus et fiches stables, jamais un rapprochement sur le seul hangul.
  // 먹다 = manger (formes acquises), 역 = gare, 쓰다 = écrire, 일 = travail.
  // Les homonymes « sourd », « rôle », « porter », « un » et « yeux » sont exclus.
  const vocabulary = {
    "가게": ["1779706066025"],
    "가깝다": ["1764055523116"],
    "가다": ["1779706066114"],
    "가르치다": ["1779706066126"],
    "가방": ["pack-142a3028"],
    "가볍다": ["pack-3cf114a1"],
    "가져가다": ["1780695436528"],
    "걷다": ["1780695436521"],
    "곳": ["pack-d22a806f"],
    "공부하다": ["1763265381578"],
    "공원": ["1779706066026"],
    "과일": ["1763266778551"],
    "금요일": ["1779706065993"],
    "기다리다": ["1779561905119"],
    "길다": ["1779706066139"],
    "깨끗하다": ["pack-0990d1e0"],
    "끝나다": ["1779706066131"],
    "날씨": ["1779706066104"],
    "내일": ["1779706065979"],
    "노래": ["1779724539692"],
    "눈:neige": ["1779706066106"],
    "닫다": ["1779706066090"],
    "덥다": ["1779706066108"],
    "도서관": ["1779706066019"],
    "도착하다": ["1779706066129"],
    "돈": ["1779706066047"],
    "동생": ["1779724539679"],
    "듣다": ["1779706066118"],
    "들다": ["pack-5bccde40"],
    "똑똑하다": ["1763263907958"],
    "마시다": ["1779706066121"],
    "만나다": ["pack-75ed8569"],
    "만들다": ["1780695436518"],
    "말하다": ["1779706066119"],
    "맛있다": ["1779706066073"],
    "맵다": ["1763266212580"],
    "먹다": ["1779724539586","1779724539593"],
    "멀다": ["pack-7655799c"],
    "메모": ["pack-f3ce23c8"],
    "메시지": ["pack-96330a61"],
    "모르다": ["1780695436517"],
    "목마르다": ["1779706066076"],
    "목요일": ["1779706065992"],
    "무겁다": ["pack-d819d53d"],
    "묻다": ["pack-93f8e5ed"],
    "물": ["1779706066060"],
    "바쁘다": ["1779706066144"],
    "밤": ["1779706065985"],
    "밥": ["1779706066059"],
    "방": ["1763265221839"],
    "배고프다": ["1779706066075"],
    "배우다": ["1779706066125"],
    "버스": ["1779706066032"],
    "병원": ["1779706066016"],
    "보내다": ["1779706066124"],
    "보다": ["1779706066117"],
    "부르다": ["pack-e357c4e6"],
    "부엌": ["1763265025043"],
    "비": ["pack-d3b0e1a3"],
    "비싸다": ["1779706066051"],
    "빌려주다": ["1765435351795"],
    "빵": ["1779706066068"],
    "사다": ["1764056487960"],
    "사람": ["1780695436532"],
    "사진": ["1779724539695"],
    "서점": ["1763264976938"],
    "선물": ["pack-9c52d809"],
    "선생님": ["1765436356686"],
    "수요일": ["1779706065991"],
    "쉬다": ["1779706066103"],
    "시간": ["1779706066009"],
    "시장": ["1779706066023"],
    "식당": ["1779706066022"],
    "신문": ["pack-ba7e7e02"],
    "싸다": ["1779706066052"],
    "쓰다": ["1779706066120"],
    "쓰다:amer": ["1763266887926"],
    "아버지": ["1779724539673"],
    "아이": ["1780695436471"],
    "아침": ["1779706065982"],
    "어렵다": ["1779706066143"],
    "어머니": ["1779724539674"],
    "없다": ["pack-82910d75"],
    "여기": ["1780695436411"],
    "여행": ["1779724539690"],
    "역": ["pack-093c375b"],
    "열다": ["1779706066089"],
    "영화": ["pack-e6cc255f"],
    "예쁘다": ["1763264129866"],
    "오늘": ["1779706065977"],
    "오다": ["1779706066115"],
    "옷": ["1780695436366"],
    "요리하다": ["1763265115177"],
    "우산": ["pack-c3c6d557"],
    "우체국": ["1779706066018"],
    "운동하다": ["1763265703951"],
    "월요일": ["1779706065989"],
    "은행": ["1779706066015"],
    "음식": ["1763266436624"],
    "음악": ["1779724539691"],
    "의사": ["1763266322884"],
    "이름": ["1780695436530"],
    "이메일": ["pack-3c37764a"],
    "일": ["1779706066127"],
    "일하다": ["1779706066127"],
    "읽다": ["1765436085011"],
    "있다": ["pack-f033ae55"],
    "자다": ["1779706066102"],
    "작다": ["1779706066138"],
    "재미있다": ["1763263829317"],
    "저녁": ["1779706065984"],
    "전화하다": ["pack-e8e5e933"],
    "점심": ["1779706065983"],
    "정류장": ["1763264301220"],
    "좋다": ["1779706066133"],
    "주다": ["1779706066123"],
    "주말": ["1779706065988"],
    "질문": ["pack-2ab096e7"],
    "집": ["1779706066028"],
    "차": ["1779706066061"],
    "창문": ["1763265830119"],
    "책": ["pack-62cc8ca8"],
    "청소하다": ["1763265345816"],
    "체육관": ["pack-f5fc5f2a"],
    "춥다": ["1779706066109"],
    "친구": ["1780695436533"],
    "카페": ["1779706066021"],
    "커피": ["pack-98bb79d2"],
    "크다": ["1779706066137"],
    "타다": ["1779706066040"],
    "텔레비전": ["pack-9406c46b"],
    "편지": ["pack-9928a7bc"],
    "피곤하다": ["1763264848946"],
    "하다": ["1779706066116"],
    "학교": ["1779706066013"],
    "한국어": ["pack-6e081b59"],
    "화요일": ["1779706065990"],
    "환전하다": ["pack-d7facf33"],
    "회사": ["1779724539683"]
  };
  const data = {version:1,goals,items,vocabulary};
  if(typeof module!=="undefined" && module.exports) module.exports=data;
  else root.SORI_PRODUCTION_DATA=data;
})(typeof globalThis!=="undefined"?globalThis:this);
