import { ProcessResult, StringifiedProcessResult } from "./types";
import * as fs from 'fs'
import ProcessWrapper from "./ProcessWrapper";
import * as colors from 'colors'
import prompts from 'prompts'
import moment from "moment";
import isBase64 from 'is-base64'

export function zip<T1,T2>(arr1:T1[], arr2:T2[]):[T1,T2][] { return arr1.map((k, i) => [k, arr2[i]]) }

export type Fun<A,B> = (_:A)=>B

export const space = '[[:space:]]'

export const escaped_backslash = '\\|'

export const pgpass_path = `${process.env.HOME}/.pgpass`

export const toStringified = (res:ProcessResult):StringifiedProcessResult => ({code: res.code, stderr: res.stderr.toString(), stdout: res.stdout.toString()})

export const logGrey = (logString:string):void => withColors(() => console.log(logString.grey))

export const logGreen = (logString:string):void => withColors(() => console.log(logString.green.bold))

export const logRed = (logString:string):void => withColors(() => console.log(logString.red))

export const logYellow = (logString:string):void => withColors(() => console.log(logString.yellow))

export const take_until_last_front_slash = (path:string):string => path.substring(0,path.lastIndexOf('/'))

export const take_after_last_front_slash = (path:string):string => {
  const splitted = path.split('/')
  return splitted[splitted.length-1]
}

export const createPgpassFile = async (args:{host:string, username:string, password:string, port:number}) => {
  const connection_string = `${args.host}:${args.port}:*:${args.username}:${args.password}`

  logGrey('Checking for pgpass file')
  const pgFileExists = await new ProcessWrapper(`test -f ${pgpass_path}`).run().then(res => res.code === 0)

  if(pgFileExists) {
    logGrey('.pgpass file found')
    const shouldWrite = await new ProcessWrapper(`cat ${pgpass_path}`).pipe(`grep -F ${connection_string}`).run().then(res => res.code !== 0)
    if(shouldWrite) {
      logGrey('Connection string not found in .pgpass. Writing.')
      fs.appendFileSync(pgpass_path,`${connection_string}\n`)
    }
  }
  else {
    logGrey('Creating .pgpass')
    fs.appendFileSync(pgpass_path,`${connection_string}\n`)
  }

  logGrey('Setting permissions')
  const settedPermissions = await new ProcessWrapper(`chmod 600 ${pgpass_path}`).run().then(res => res.code == 0)
  if(!settedPermissions)
    logGrey('Error setting permissions.')
}

export function withColors<T>(action:()=>T):T {
  let rval:T
  if(colors.enabled)
    rval = action()
  else {
    colors.enable()
    rval = action()
    colors.disable()
  }
  return rval
}

export const inlineObjectShow = (obj:any):string => obj == null || obj == undefined ? '' : JSON.stringify(obj).substring(0,200)

export let suggestFunction = (input: any, choices: prompts.Choice[]): Promise<any> => new Promise<any>((res, _) => {
  const parsed = input as string

  if (parsed.length == 0)
    return res(choices)

  try {
  const matchedByTitle = choices.filter(choice => choice.title.toLowerCase().match(new RegExp(parsed.toLowerCase())) != null)
    .map(choice => [choice, choice.title.toLowerCase().matchAll(new RegExp(parsed.toLowerCase(), 'g'))] as [prompts.Choice, IterableIterator<RegExpMatchArray>])
  const matchedByDescription: [prompts.Choice, IterableIterator<RegExpMatchArray>][] = choices.filter(choice => choice.description && choice.description.toLowerCase().match(new RegExp(parsed.toLowerCase())) != null)
    .map(choice => [choice, choice.description && choice.description.toLowerCase().matchAll(new RegExp(parsed.toLowerCase(), 'g'))] as [prompts.Choice, IterableIterator<RegExpMatchArray>])
  let allMatches = matchedByTitle.concat(matchedByDescription).sort((a, b) => {
    let aa = a[1]
    let bb = b[1]
    let maxA = null
    let maxB = null
    for (var i of aa)
      if (maxA == null || (i.index != null && i.index < maxA))
        maxA = i.index
    for (var i of bb)
      if (maxB == null || (i.index != null && i.index < maxB))
        maxB = i.index
    
    if(maxA == null && maxB == null)
      return 0
    if (maxA == null)
      return maxB as number
    if (maxB == null)
      return -(maxA as number)
    return maxA - maxB == 0 ? a[0].title.length - b[0].title.length : maxA - maxB
  }).map(([choice, _]) => choice)
    .filter((v, i, a) => a.indexOf(v) === i)
  return res(allMatches)
  } catch {
    return res([])
  }
})

export const formatDumpName = (tag:string | undefined):string => tag == null ? `./dumps/${moment().format()}` : `./dumps/${tag}_${moment().format()}`

export async function interact(obj: any, nested_counter: number, current_obj?:string): Promise<any> {
  if(typeof obj == 'string') {
    const rval = await prompts({
      type: 'text',
      name: 'value',
      message: `${current_obj && current_obj.length > 0 ? `${current_obj}:`: ''}${obj as string}`
    })

    return rval.value
  }

  const choice = await prompts({
    type: 'autocomplete',
    name: 'key',
    message: current_obj && current_obj.length > 0 ? `${current_obj}:` : 'Pick a property',
    suggest: suggestFunction,
    limit: 20,
    choices: withColors(() => {
      let fixedChoices = [{ title: nested_counter == 0 ? 'Save and Exit'.green : 'Save and Go Back'.green, value: '*exit*' }]
      if (obj instanceof Array) {
        fixedChoices.push({ title: 'Add element'.green, value: '*add*' })
        fixedChoices.push({ title: 'Remove element'.red, value: '*rem*' })
      }
      return fixedChoices.concat(Object.keys(obj).filter(key => obj[key] != undefined).map(key => ({ title: key, value: key, description: inlineObjectShow(obj[key]) })))
      })
    })

  if (choice.key == '*exit*')
    return obj

  return await withValue(obj,async new_obj => {
    if (choice.key == '*rem*') {
      let array = new_obj as any[]
      const to_remove = await prompts({
        type:'autocomplete',
        name:'index',
        message: 'Pick an array element to delete',
        suggest: suggestFunction,
        choices: array.map((elem,index) => ({title: `${index}`, description: inlineObjectShow(elem), value:index}))
      })
      array.splice(to_remove.index,1)
    }
  
    else if(choice.key == '*add*') {
      let array = new_obj as any[]
      const to_add = await prompts({
        type:'autocomplete',
        name:'index',
        message: 'Pick an array element to duplicate',
        suggest: suggestFunction,
        choices: array.map((elem,index) => ({title: `${index}`, description: inlineObjectShow(elem), value:index}))
      })
      let toAddObj:any = await withValue(new_obj[to_add.index],(nested_new_object:any) => interact(nested_new_object,nested_counter+1))
      array.push(toAddObj)
    }
  
    else {
      switch (typeof new_obj[choice.key]) {
        case 'string':
          await prompts({
            type: 'text',
            name: 'value',
            message: new_obj[choice.key] as string
          }).then(val => new_obj[choice.key] = val.value)
          break
        case 'number':
          await prompts({
            type: 'number',
            name: 'value',
            message: (new_obj[choice.key] as number).toString()
          }).then(val => new_obj[choice.key] = val.value)
          break
        case 'boolean':
          await prompts({
            type: 'autocomplete',
            name: 'value',
            message: (new_obj[choice.key] as boolean).toString(),
            choices: [
              { title: 'true', value: 't'},
              { title: 'false', value: 'f'}
            ]
          }).then(val => new_obj[choice.key] = val.value == 't' ? true : false)
          break
        default:
          try {
            await interact(obj[choice.key], nested_counter + 1, current_obj == null ? choice.key : `${current_obj}.${choice.key}`).then(nested_rval => new_obj[choice.key] = nested_rval)
          } catch (error) {
            logRed(error)
            return obj
          }
          break
      }
    }
    return await interact(new_obj, nested_counter, current_obj)
  })
}

export function withValue<T1,T2>(obj:T1,callback:(_:T1) => T2):T2 {
  return callback({...obj} as T1)
}

export function withReference<T1,T2>(obj:T1,callback:(_:T1) => T2):T2 {
  return callback(obj)
}

export function decode_all_base64(obj:any):any {
  if(typeof obj == 'string') {
    if(isBase64(obj)) {
      let res = Buffer.from(obj,'base64').toString('utf-8')
      try {
        let parsed = JSON.parse(res)
        return decode_all_base64(parsed)
      } catch {
        return res
      }
    }
    return obj
  }

  if(typeof obj == 'object') {
    if(obj instanceof Array)
      return obj.map(decode_all_base64)
    Object.keys(obj).forEach(prop => obj[prop] == null ? null : obj[prop] = decode_all_base64(obj[prop]))
    return obj
  }

  return obj
}