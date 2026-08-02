#ifndef NOTICEH
#define NOTICEH

/*
Confirmation window for the XView-PC interface, C version.
By Antonio Carlos Moreirao de Queiroz - acmq@coe.ufrj.br
Version 1.0 - 19/04/94
Version 1.1 - 09/07/94 Compatible with djgpp

The function:
  int notice(char *txt)
prompts the user for a yes/no answer and returns 1 (yes) or 0 (no)
The opened window has exclusive access, and is allocated dinamically.
*/

#include <string.h>
#include "xview.h"
#include <malloc.h>

Xv_opaque fnotice,btyes,btno;
int notice_answer;

void receive_notice(Xv_opaque obj)
{
  notice_answer=(obj==btyes);
  close_window(fnotice);
}

int notice(char *txt)
{
  Xv_opaque temp1;
  int temp2;
  struct viewporttype VP;

  fnotice=xv_create(frame);
    strcpy(fnotice->xv_label,txt);
    fnotice->x=(getmaxx()-179)/2;
    fnotice->y=(getmaxy()-39)/2;
    fnotice->dx=179;
    fnotice->dy=39;
    fnotice->v.sframe.dymin=27;
    fnotice->v.sframe.adjust_exit=0;
  btyes=xv_create(button);
	strcpy(btyes->xv_label,"Yes");
	btyes->x=50;
	btyes->notify_handler=(xv_handler)receive_notice;
  btno=xv_create(button);
	strcpy(btno->xv_label,"No ");
	btno->x=86;
	btno->notify_handler=(xv_handler)receive_notice;
  fnotice->v.sframe.mouse_obj=btyes;
  temp1=active_w;
  temp2=wallpaper;
  wallpaper=1;
  active_w=NULL;
  getviewsettings(&VP);
  xv_main_loop(fnotice);
  setviewport(VP.left,VP.top,VP.right,VP.bottom,VP.clip);
  xv_end=0;
  wallpaper=temp2;
  active_w=temp1;
  free(btyes); free(btno); free(fnotice);
  return notice_answer;
}

#endif
