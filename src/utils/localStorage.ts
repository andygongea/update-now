import { Memento } from "vscode";

export class LocalStorageService {
    
    constructor(private storage: Memento) { }   
    
    public getData<T>(key : string) : T | undefined{
        return this.storage.get<T>(key);
    }

    public setData<T>(key : string, defaultValue : T){
        this.storage.update(key, defaultValue );
    }
}