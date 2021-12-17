const fs = require('fs') 
const delay = require('delay')
const { DateTime } = require('luxon')
const chalk = require('chalk')
const MongoClient = require('mongodb').MongoClient
const uri = 'mongodb://smshacn310:27017'
const { scrapper, formatter } = require('./scrapper.js')

MongoClient.connect(
  uri,
  { useNewUrlParser: true, useUnifiedTopology: true },
  (err, client) => {
    if (err) return console.log(err)
    db = client.db('HMACN_DEV') // coloque o nome do seu DB
  }
);

const setDelay = () => {
  const time = DateTime.now({zone: 'America/Sao_Paulo'})
  let hora = time.hour
  if(hora >= 0 && hora<= 5) return 2700000 //45 minutos durante a madrugada
  if(hora > 5 && hora<= 15) return 360000 //360000 6 minutos das 7 até 12
  if(hora > 15 && hora<= 19) return 540000 //9 minutos das 7 até 12
  if(hora > 19 && hora<= 23) return 960000 //16 minutos das 7 até 12
}

(async () => {
  let acc = 1
  while (true) {

    //let data = await scrapper(setDelay()).catch((err) => err)    
    let data = await scrapper(1).catch((err) => err)    
    let kanban = await formatter(data)
        
    // Refatorando 
    
    if (kanban !==null) { 
      // Coleta os valores existentes no banco de dados
      let results = await db.collection('pacientes_internados').find().toArray()
      
      let kanbanOLD = []
      let kanbanNEW = []

      
      results.forEach(p => {        
        kanbanOLD.push(p.prontuario)
      })      

      kanban.forEach(p => {
        kanbanNEW.push(p.prontuario)
      })
      
      //Filtra os valores diferentes entre uma lista e outra
      const pacientes_removidos = kanbanOLD.filter((p) => !kanbanNEW.includes(p))
      let bufferAlta = pacientes_removidos
      //Remove os dados de pacientes com alta do banco de dados      
      pacientes_removidos.forEach((p, i) =>  {
        db.collection('pacientes_internados').deleteOne({prontuario: p}, (err, obj) => {
          if (err) throw err;
          
        });
      })   
      
      //Realiza o Replace de dados de pacientes com base no RH dos mesmos
      kanban.forEach(p => {
        db.collection('pacientes_internados').replaceOne({prontuario: p.prontuario}, p ,{upsert: true}, (err, res) => {
          if (err) throw err;
        })
      })

      bufferAlta.forEach( a => {
        db.collection('ALTAS').insertOne({data: DateTime.now(), alta: a}, err => {
          if(err) console.log(err)
        })
      })      
      
      console.log(chalk.bgCyan.bold('► Altas:\n'+ bufferAlta.length + '\n'))  
      console.log(chalk.bgYellow.bold('► Dados salvos em banco de dados.\n'))
      
    } else {      
      console.log(chalk.bgRed.bold('► Navegador foi fechado, reiniciando processo de coleta.'))
    }
  }
 
 
})()

