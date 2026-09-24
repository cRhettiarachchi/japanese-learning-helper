(()=>{
 'use strict';
 const source=document.getElementById('article-lookup-data');if(!source)return;
 const tokens=JSON.parse(source.textContent);let dictionary;
 const popup=DictionaryLookup.createPopup({document,loadDictionary:()=>{
  dictionary ||= fetch('/listening/dictionary.json',{credentials:'same-origin'}).then(response=>{if(!response.ok)throw Error('Dictionary unavailable');return response.json();}).then(data=>{if(!data.entries)throw Error('Invalid dictionary');return data.entries;}).catch(error=>{dictionary=null;throw error;});
  return dictionary;
 }});
 document.addEventListener('click',event=>{const word=event.target.closest('button[data-article-word]');if(word&&tokens[word.dataset.word])void popup.open(word,tokens[word.dataset.word]);});
})();
