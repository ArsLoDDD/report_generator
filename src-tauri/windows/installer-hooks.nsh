!macro NSIS_HOOK_PREINSTALL
  ; Версії до 0.2.0 зберігали робочі дані біля .exe. Копіюємо їх до
  ; постійної папки до того, як інсталятор почне замінювати файли.
  CreateDirectory "$LOCALAPPDATA\ua.shablonizator.advanced"

  ${If} ${FileExists} "$INSTDIR\особовий_склад.db"
  ${AndIfNot} ${FileExists} "$LOCALAPPDATA\ua.shablonizator.advanced\особовий_склад.db"
    CopyFiles /SILENT "$INSTDIR\особовий_склад.db" "$LOCALAPPDATA\ua.shablonizator.advanced"
  ${ElseIf} ${FileExists} "$INSTDIR\База даних\особовий_склад.db"
  ${AndIfNot} ${FileExists} "$LOCALAPPDATA\ua.shablonizator.advanced\особовий_склад.db"
    CopyFiles /SILENT "$INSTDIR\База даних\особовий_склад.db" "$LOCALAPPDATA\ua.shablonizator.advanced"
  ${EndIf}
  ${If} ${FileExists} "$EXEDIR\особовий_склад.db"
  ${AndIfNot} ${FileExists} "$LOCALAPPDATA\ua.shablonizator.advanced\особовий_склад.db"
    CopyFiles /SILENT "$EXEDIR\особовий_склад.db" "$LOCALAPPDATA\ua.shablonizator.advanced"
  ${ElseIf} ${FileExists} "$EXEDIR\База даних\особовий_склад.db"
  ${AndIfNot} ${FileExists} "$LOCALAPPDATA\ua.shablonizator.advanced\особовий_склад.db"
    CopyFiles /SILENT "$EXEDIR\База даних\особовий_склад.db" "$LOCALAPPDATA\ua.shablonizator.advanced"
  ${EndIf}

  ${If} ${FileExists} "$INSTDIR\settings.json"
  ${AndIfNot} ${FileExists} "$LOCALAPPDATA\ua.shablonizator.advanced\settings.json"
    CopyFiles /SILENT "$INSTDIR\settings.json" "$LOCALAPPDATA\ua.shablonizator.advanced"
  ${EndIf}
  ${If} ${FileExists} "$EXEDIR\settings.json"
  ${AndIfNot} ${FileExists} "$LOCALAPPDATA\ua.shablonizator.advanced\settings.json"
    CopyFiles /SILENT "$EXEDIR\settings.json" "$LOCALAPPDATA\ua.shablonizator.advanced"
  ${EndIf}
  ${If} ${FileExists} "$INSTDIR\custom_variables.json"
  ${AndIfNot} ${FileExists} "$LOCALAPPDATA\ua.shablonizator.advanced\custom_variables.json"
    CopyFiles /SILENT "$INSTDIR\custom_variables.json" "$LOCALAPPDATA\ua.shablonizator.advanced"
  ${EndIf}
  ${If} ${FileExists} "$EXEDIR\custom_variables.json"
  ${AndIfNot} ${FileExists} "$LOCALAPPDATA\ua.shablonizator.advanced\custom_variables.json"
    CopyFiles /SILENT "$EXEDIR\custom_variables.json" "$LOCALAPPDATA\ua.shablonizator.advanced"
  ${EndIf}

  ${If} ${FileExists} "$INSTDIR\Шаблони\*.*"
  ${AndIfNot} ${FileExists} "$LOCALAPPDATA\ua.shablonizator.advanced\Шаблони\*.*"
    CopyFiles /SILENT "$INSTDIR\Шаблони" "$LOCALAPPDATA\ua.shablonizator.advanced"
  ${EndIf}
  ${If} ${FileExists} "$EXEDIR\Шаблони\*.*"
  ${AndIfNot} ${FileExists} "$LOCALAPPDATA\ua.shablonizator.advanced\Шаблони\*.*"
    CopyFiles /SILENT "$EXEDIR\Шаблони" "$LOCALAPPDATA\ua.shablonizator.advanced"
  ${EndIf}
  ${If} ${FileExists} "$INSTDIR\Згенеровані рапорти\*.*"
  ${AndIfNot} ${FileExists} "$LOCALAPPDATA\ua.shablonizator.advanced\Згенеровані рапорти\*.*"
    CopyFiles /SILENT "$INSTDIR\Згенеровані рапорти" "$LOCALAPPDATA\ua.shablonizator.advanced"
  ${EndIf}
  ${If} ${FileExists} "$EXEDIR\Згенеровані рапорти\*.*"
  ${AndIfNot} ${FileExists} "$LOCALAPPDATA\ua.shablonizator.advanced\Згенеровані рапорти\*.*"
    CopyFiles /SILENT "$EXEDIR\Згенеровані рапорти" "$LOCALAPPDATA\ua.shablonizator.advanced"
  ${EndIf}
  ${If} ${FileExists} "$INSTDIR\Резервні копії\*.*"
  ${AndIfNot} ${FileExists} "$LOCALAPPDATA\ua.shablonizator.advanced\Резервні копії\*.*"
    CopyFiles /SILENT "$INSTDIR\Резервні копії" "$LOCALAPPDATA\ua.shablonizator.advanced"
  ${EndIf}
  ${If} ${FileExists} "$EXEDIR\Резервні копії\*.*"
  ${AndIfNot} ${FileExists} "$LOCALAPPDATA\ua.shablonizator.advanced\Резервні копії\*.*"
    CopyFiles /SILENT "$EXEDIR\Резервні копії" "$LOCALAPPDATA\ua.shablonizator.advanced"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Інсталятор і кожне файлове оновлення залишають актуальний ярлик програми.
  CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
!macroend
