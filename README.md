# onlyoffice-plugins

# เปิด example

```
docker exec de23317cd380 sed -i 's/autostart=false/autostart=true/' /etc/supervisor/conf.d/ds-example.conf
docker exec de23317cd380 supervisorctl reread
docker exec de23317cd380 supervisorctl update
docker exec de23317cd380 supervisorctl start ds:example
```

# เปิด admin panel

```
docker exec de23317cd380 sed -i 's/autostart=false/autostart=true/' /etc/supervisor/conf.d/ds-adminpanel.conf
docker exec de23317cd380 supervisorctl reread
docker exec de23317cd380 supervisorctl update
docker exec de23317cd380 supervisorctl start ds:adminpanel
```
